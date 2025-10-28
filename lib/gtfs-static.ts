// GTFS Static Schedule Parser for Caltrain
// Fetches and parses GTFS static data from 511.org API

import { Train } from './types';
import { getStationById, stations } from './stations';
import { TripUpdate, getTripDelay } from './gtfs-realtime';
import { TrainDelay } from './caltrain-alerts-scraper';

interface GTFSStopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

interface GTFSTrip {
  trip_id: string;
  route_id: string;
  service_id: string;
  trip_short_name: string;
  trip_headsign: string;
  direction_id: string;
}

interface GTFSCalendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

interface GTFSCalendarDate {
  service_id: string;
  date: string;
  exception_type: string; // 1 = service added, 2 = service removed
}

let gtfsCache: {
  stopTimes: GTFSStopTime[];
  trips: GTFSTrip[];
  calendar: GTFSCalendar[];
  calendarDates: GTFSCalendarDate[];
  lastFetch: Date | null;
} = {
  stopTimes: [],
  trips: [],
  calendar: [],
  calendarDates: [],
  lastFetch: null,
};

const CACHE_DURATION_HOURS = 24; // Cache GTFS data for 24 hours

/**
 * Get the current date/time in Pacific Time
 * Returns an object with date parts in Pacific timezone
 *
 * IMPORTANT: Caltrain operates on Pacific Time (America/Los_Angeles)
 * This function correctly handles:
 * - PDT (Pacific Daylight Time): March-November (UTC-7)
 * - PST (Pacific Standard Time): November-March (UTC-8)
 * - DST transitions: Spring forward (2 AM -> 3 AM) and Fall back (2 AM -> 1 AM)
 *
 * The America/Los_Angeles timezone automatically handles all DST transitions
 * as defined by US federal law (2nd Sunday in March / 1st Sunday in November)
 *
 * @param date - Any Date object (typically new Date() for current time)
 * @returns Object with Pacific Time day of week, date string, and date object
 */
function getPacificTimeInfo(date: Date) {
  // Convert to Pacific Time string
  // This automatically handles PDT/PST based on the date
  const pacificTimeString = date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  // Extract date parts in Pacific Time
  const parts = date.toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).split('/');

  const pacificDate = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);

  // Get day of week in Pacific Time (0=Sunday, 6=Saturday)
  // This is CRITICAL for matching GTFS calendar (weekday vs weekend schedules)
  const dayOfWeek = new Date(date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles'
  })).getDay();

  // Format date as YYYYMMDD for GTFS calendar_dates.txt matching
  const dateStr = `${parts[2]}${parts[0]}${parts[1]}`;

  return {
    dayOfWeek,
    dateStr,
    pacificDate
  };
}

/**
 * Determine which service_id to use based on current date
 */
function getActiveServiceId(
  date: Date,
  calendar: GTFSCalendar[],
  calendarDates: GTFSCalendarDate[]
): string | null {
  // Get Pacific Time date information
  const { dayOfWeek, dateStr } = getPacificTimeInfo(date);

  // Check for exception dates (holidays)
  const exceptionDate = calendarDates.find(
    (cd) => cd.date === dateStr && cd.exception_type === '1'
  );
  if (exceptionDate) {
    return exceptionDate.service_id;
  }

  // Find active service based on day of week
  for (const cal of calendar) {
    const startDate = parseInt(cal.start_date);
    const endDate = parseInt(cal.end_date);
    const currentDate = parseInt(dateStr);

    if (currentDate < startDate || currentDate > endDate) continue;

    // Check if service is removed for this specific date
    const removed = calendarDates.find(
      (cd) => cd.date === dateStr && cd.service_id === cal.service_id && cd.exception_type === '2'
    );
    if (removed) continue;

    // Check day of week
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[dayOfWeek];

    if (cal[dayName as keyof GTFSCalendar] === '1') {
      return cal.service_id;
    }
  }

  return null;
}

/**
 * Parse CSV text into array of objects
 */
function parseCSV(csvText: string): any[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const result: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj: any = {};

    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });

    result.push(obj);
  }

  return result;
}

/**
 * Load GTFS data from local files (for offline/mock data support)
 */
async function loadLocalGTFSData(): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');

    const dataDir = path.join(process.cwd(), 'data', 'gtfs');

    // Read local GTFS files
    const stopTimesData = await fs.readFile(path.join(dataDir, 'stop_times.txt'), 'utf8');
    const tripsData = await fs.readFile(path.join(dataDir, 'trips.txt'), 'utf8');
    const calendarData = await fs.readFile(path.join(dataDir, 'calendar.txt'), 'utf8');
    const calendarDatesData = await fs.readFile(path.join(dataDir, 'calendar_dates.txt'), 'utf8');

    // Parse CSV data
    gtfsCache.stopTimes = parseCSV(stopTimesData);
    gtfsCache.trips = parseCSV(tripsData);
    gtfsCache.calendar = parseCSV(calendarData);
    gtfsCache.calendarDates = parseCSV(calendarDatesData);

    gtfsCache.lastFetch = new Date();

    console.log(`GTFS data loaded from local files: ${gtfsCache.stopTimes.length} stop times, ${gtfsCache.trips.length} trips`);
    return true;
  } catch (error) {
    console.error('Error loading local GTFS data:', error);
    return false;
  }
}

/**
 * Fetch and cache GTFS static data from remote source or local files
 */
async function fetchGTFSData(): Promise<boolean> {
  // Check cache validity
  if (gtfsCache.lastFetch) {
    const hoursSinceLastFetch =
      (Date.now() - gtfsCache.lastFetch.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastFetch < CACHE_DURATION_HOURS) {
      return true; // Use cached data
    }
  }

  const apiKey = process.env.TRANSIT_API_KEY;

  // Try remote fetch first if API key is configured
  if (apiKey) {
    try {
      console.log('Fetching GTFS static data from remote source...');

      // Use the direct Trillium Transit URL
      // In production, you could use 511.org API:
      // http://api.511.org/transit/datafeeds?api_key=${apiKey}&operator_id=CT
      const gtfsUrl = 'https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip';

      const response = await fetch(gtfsUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch GTFS data: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(Buffer.from(arrayBuffer));

      // Parse required files
      const stopTimesEntry = zip.getEntry('stop_times.txt');
      const tripsEntry = zip.getEntry('trips.txt');
      const calendarEntry = zip.getEntry('calendar.txt');
      const calendarDatesEntry = zip.getEntry('calendar_dates.txt');

      if (!stopTimesEntry || !tripsEntry || !calendarEntry) {
        throw new Error('Required GTFS files not found in zip');
      }

      // Parse CSV data
      gtfsCache.stopTimes = parseCSV(stopTimesEntry.getData().toString('utf8'));
      gtfsCache.trips = parseCSV(tripsEntry.getData().toString('utf8'));
      gtfsCache.calendar = parseCSV(calendarEntry.getData().toString('utf8'));
      gtfsCache.calendarDates = calendarDatesEntry
        ? parseCSV(calendarDatesEntry.getData().toString('utf8'))
        : [];

      gtfsCache.lastFetch = new Date();

      console.log(`GTFS data loaded from remote: ${gtfsCache.stopTimes.length} stop times, ${gtfsCache.trips.length} trips`);
      return true;
    } catch (error) {
      console.error('Error fetching remote GTFS data, trying local files:', error);
    }
  }

  // Fall back to local files (for mock data without API key)
  return await loadLocalGTFSData();
}

/**
 * Map station code to GTFS stop_id
 * Caltrain GTFS uses 5-digit codes: 7001X where X is 1 (Northbound) or 2 (Southbound)
 */
function findGTFSStopId(stationCode: string, directionId: string): string {
  // Mapping from our station codes to GTFS stop ID base numbers
  const codeMapping: { [key: string]: string } = {
    'SF': '7001',
    '22ND': '7002',
    'BAYSHORE': '7003',
    'SSF': '7004',  // South San Francisco
    'SB': '7005',   // San Bruno
    'MB': '7006',   // Millbrae
    'MILLBRAE': '7006',
    'BURLINGAME': '7008',
    'SM': '7009',   // San Mateo
    'HAYWARD': '7010',  // Hayward Park
    'HILLSDALE': '7011',
    'BELMONT': '7012',
    'SC': '7013',   // San Carlos
    'SAN CARLOS': '7013',
    'RW': '7014',   // Redwood City
    'REDWOOD': '7014',
    'MP': '7016',   // Menlo Park
    'MENLO': '7016',
    'PA': '7017',   // Palo Alto
    'PALO ALTO': '7017',
    'STANFORD': '253774', // Stanford (special ID)
    'CALAVEUE': '7019', // California Ave
    'CALIFORNIA': '7019',
    'SAN ANTONIO': '7020',
    'MV': '7021',   // Mountain View
    'MOUNTAIN VIEW': '7021',
    'SUNNYVALE': '7022',
    'LAWRENCE': '7023',
    'SANTACLARA': '7024',
    'SANTA CLARA': '7024',
    'COLLEGEPARK': '7025',
    'COLLEGE PARK': '7025',
    'SJ': '7026',   // San Jose Diridon
    'DIRIDON': '7026',
    'TAMIEN': '7027',
    'CAPITOL': '7028',
    'BH': '7029',   // Blossom Hill
    'BLOSSOM HILL': '7029',
    'MH': '7030',   // Morgan Hill
    'MORGAN HILL': '7030',
    'SAN MARTIN': '7031',
    'GILROY': '7032'
  };

  const baseCode = codeMapping[stationCode.toUpperCase()];
  if (!baseCode) {
    console.warn(`No GTFS mapping found for station code: ${stationCode}`);
    return `${stationCode}${directionId === '0' ? '1' : '2'}`; // Fallback to old format
  }

  // Stanford has a special ID format
  if (baseCode === '253774') {
    return directionId === '0' ? '2537740' : '2537744';
  }

  // Append direction: 1 for Northbound (direction_id='0'), 2 for Southbound (direction_id='1')
  return `${baseCode}${directionId === '0' ? '1' : '2'}`;
}

/**
 * Get trains from real GTFS schedule
 */
export async function getScheduledTrains(
  originStationId: string,
  destinationStationId: string,
  date: Date = new Date(),
  tripUpdates: TripUpdate[] = [],
  caltrainAlerts: Map<string, TrainDelay> = new Map()
): Promise<Train[]> {
  console.log(`getScheduledTrains called: ${originStationId} -> ${destinationStationId}`);

  // Ensure GTFS data is loaded
  const loaded = await fetchGTFSData();
  if (!loaded || gtfsCache.trips.length === 0) {
    console.error('GTFS data not loaded or empty');
    return []; // Return empty if GTFS not available
  }

  console.log(`GTFS data loaded: ${gtfsCache.trips.length} trips, ${gtfsCache.stopTimes.length} stop times`);

  const originStation = getStationById(originStationId);
  const destinationStation = getStationById(destinationStationId);

  if (!originStation || !destinationStation) {
    console.error('Station not found:', { originStation, destinationStation });
    return [];
  }

  // Determine which service is active today
  const serviceId = getActiveServiceId(date, gtfsCache.calendar, gtfsCache.calendarDates);
  if (!serviceId) {
    console.warn('No active service found for date:', date);
    return [];
  }

  console.log(`Active service ID: ${serviceId} for date ${date.toLocaleDateString()}`);

  // Get all trips for this service
  const activeTrips = gtfsCache.trips.filter((trip) => trip.service_id === serviceId);
  console.log(`Found ${activeTrips.length} active trips for service ${serviceId}`);

  // Determine direction based on actual station geographic order
  // Stations array is ordered north to south, so we can use array indices
  const originIndex = stations.findIndex(s => s.id === originStationId);
  const destIndex = stations.findIndex(s => s.id === destinationStationId);

  // If origin is before destination in the array, we're going south (higher index)
  const isNorthbound = originIndex > destIndex;
  const directionId = isNorthbound ? '0' : '1'; // 0 = Northbound, 1 = Southbound

  console.log(`Direction: ${originStation.name} (index ${originIndex}) -> ${destinationStation.name} (index ${destIndex}) = ${isNorthbound ? 'Northbound' : 'Southbound'} (direction_id=${directionId})`);

  // Map station codes to GTFS stop IDs
  // GTFS uses numeric stop IDs: 7001X format where X is 1 (NB) or 2 (SB)
  // We need to find the actual stop_id from the GTFS stops data
  const originStopId = findGTFSStopId(originStation.code, directionId);
  const destStopId = findGTFSStopId(destinationStation.code, directionId);

  console.log(`Looking for trains from ${originStation.name} (${originStopId}) to ${destinationStation.name} (${destStopId}), direction=${directionId}`);

  // Get current time for comparison
  const currentTimeMs = date.getTime();

  const trains: Train[] = [];

  try {
    for (const trip of activeTrips) {
      if (trip.direction_id !== directionId) continue;

    // Find stop times for this trip at origin and destination
    const originStop = gtfsCache.stopTimes.find(
      (st) => st.trip_id === trip.trip_id && st.stop_id === originStopId
    );
    const destStop = gtfsCache.stopTimes.find(
      (st) => st.trip_id === trip.trip_id && st.stop_id === destStopId
    );

    if (!originStop || !destStop) continue;

    // Parse times (HH:MM:SS)
    const departureTimeParts = originStop.departure_time.split(':');
    const arrivalTimeParts = destStop.arrival_time.split(':');

    // Build ISO timestamp strings for departure and arrival
    // GTFS times are in Pacific Time, so we need to construct proper UTC timestamps
    // Get the date components in Pacific Time
    const pacificDateParts = date.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/');

    // Create a date string in Pacific Time
    const year = pacificDateParts[2];
    const month = pacificDateParts[0].padStart(2, '0');
    const day = pacificDateParts[1].padStart(2, '0');

    if (trains.length === 0) {
      console.log(`Base date parts: ${year}-${month}-${day} from input date ${date.toISOString()}`);
    }

    // Parse the GTFS time (HH:MM:SS)
    // GTFS allows hours >= 24 for times after midnight (e.g., 25:30:00 = 01:30:00 next day)
    let depHour = parseInt(departureTimeParts[0]);
    const depMin = departureTimeParts[1].padStart(2, '0');
    const depSec = departureTimeParts[2].padStart(2, '0');

    let arrHour = parseInt(arrivalTimeParts[0]);
    const arrMin = arrivalTimeParts[1].padStart(2, '0');
    const arrSec = arrivalTimeParts[2].padStart(2, '0');

    // Create Date objects, handling hours >= 24
    // GTFS allows hours >= 24 for times after midnight (e.g., 25:30:00 = 01:30:00 next day)
    const depDayOffset = Math.floor(depHour / 24);
    const depHourNormalized = depHour % 24;

    const arrDayOffset = Math.floor(arrHour / 24);
    const arrHourNormalized = arrHour % 24;

    // Calculate the actual date accounting for day offset (for times like 25:30:00)
    // Use Date constructor with year, month, day to avoid timezone issues
    const baseDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    const depDate = new Date(baseDate);
    depDate.setDate(depDate.getDate() + depDayOffset);
    const depYear = depDate.getFullYear();
    const depMonth = String(depDate.getMonth() + 1).padStart(2, '0');
    const depDay = String(depDate.getDate()).padStart(2, '0');

    const arrDate = new Date(baseDate);
    arrDate.setDate(arrDate.getDate() + arrDayOffset);
    const arrYear = arrDate.getFullYear();
    const arrMonth = String(arrDate.getMonth() + 1).padStart(2, '0');
    const arrDay = String(arrDate.getDate()).padStart(2, '0');

    // Build complete datetime strings with Pacific timezone offset
    // Determine the Pacific Time offset for this date (accounts for DST)
    const testDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    const pacificTestStr = testDate.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    });
    // Extract timezone offset (e.g., "PDT" or "PST")
    const isPDT = pacificTestStr.includes('PDT');
    const tzOffset = isPDT ? '-07:00' : '-08:00';

    // Build ISO 8601 datetime strings with timezone
    const depDateTimeStr = `${depYear}-${depMonth}-${depDay}T${depHourNormalized.toString().padStart(2, '0')}:${depMin}:${depSec}${tzOffset}`;
    const departureDate = new Date(depDateTimeStr);

    if (trains.length === 0) {
      console.log(`First train datetime string: ${depDateTimeStr}`);
      console.log(`Parsed to Date: ${departureDate.toISOString()}`);
      console.log(`Formatted back to Pacific: ${departureDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })}`);
    }

    const arrDateTimeStr = `${arrYear}-${arrMonth}-${arrDay}T${arrHourNormalized.toString().padStart(2, '0')}:${arrMin}:${arrSec}${tzOffset}`;
    const arrivalDate = new Date(arrDateTimeStr);

    // Check if this train has real-time delay information
    // If delayed, use actual departure time (scheduled + delay) for filtering
    // Priority: 1) GTFS-Realtime, 2) Caltrain.com alerts
    let actualDepartureTimeMs = departureDate.getTime();

    // First, try GTFS-Realtime
    if (tripUpdates.length > 0) {
      const delayInfo = getTripDelay(tripUpdates, trip.trip_id);

      if (delayInfo && delayInfo.delay !== 0) {
        // Apply delay to scheduled departure time
        actualDepartureTimeMs = departureDate.getTime() + (delayInfo.delay * 60 * 1000);
      }
    }

    // If GTFS-Realtime has no delay, check Caltrain alerts as fallback
    if (actualDepartureTimeMs === departureDate.getTime() && caltrainAlerts.size > 0) {
      const alertDelay = caltrainAlerts.get(trip.trip_short_name);

      if (alertDelay) {
        // Apply delay to scheduled departure time
        actualDepartureTimeMs = departureDate.getTime() + (alertDelay.delayMinutes * 60 * 1000);
      }
    }

    // Only include trains that haven't actually departed yet (considering delays)
    if (actualDepartureTimeMs < currentTimeMs) continue;

    const durationMinutes = Math.round((arrivalDate.getTime() - departureDate.getTime()) / 60000);

    // Determine train type (Local, Limited, Express) based on number of stops
    // Count how many stops this trip makes
    const tripStopCount = gtfsCache.stopTimes.filter(
      (st) => st.trip_id === trip.trip_id
    ).length;

    // Classify based on stop count:
    // Local: 20+ stops (stops at most/all stations)
    // Limited: 13-19 stops (skips some smaller stations)
    // Express: <13 stops (only major stations)
    let trainType: 'Local' | 'Limited' | 'Express';
    if (tripStopCount >= 20) {
      trainType = 'Local';
    } else if (tripStopCount >= 13) {
      trainType = 'Limited';
    } else {
      trainType = 'Express';
    }

    trains.push({
      trainNumber: trip.trip_short_name || trip.trip_id,
      tripId: trip.trip_id, // Store trip_id for real-time delay matching
      direction: isNorthbound ? 'Northbound' : 'Southbound',
      departureTime: departureDate.toISOString(),
      arrivalTime: arrivalDate.toISOString(),
      duration: durationMinutes,
      type: trainType,
    });
    }
  } catch (error) {
    console.error('Error processing GTFS trips:', error);
    return [];
  }

  console.log(`Found ${trains.length} future trains, sorting and limiting to 5`);

  // Sort all trains by departure time and return the next 5
  return trains
    .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
    .slice(0, 5);
}
