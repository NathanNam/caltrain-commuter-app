/**
 * Runtime Moscone Events Fetcher
 *
 * This module fetches Moscone Center events at runtime from SF Travel's
 * convention calendar. Events are cached for 24 hours to minimize requests.
 */

import { VenueEvent } from './types';

const SF_TRAVEL_URL = 'https://portal.sftravel.com/calendar_public/home_sfdc.cfm';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface MosconeEvent {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description?: string;
  estimatedAttendance: number;
  crowdLevel: 'low' | 'moderate' | 'high';
}

let cachedEvents: MosconeEvent[] | null = null;
let cacheTimestamp: number = 0;

/**
 * Parse date from various formats
 */
function parseDate(dateStr: string): string | null {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Estimate event details based on name
 */
function estimateEventDetails(eventName: string): {
  crowdLevel: 'low' | 'moderate' | 'high';
  estimatedAttendance: number;
  description?: string;
} {
  const name = eventName.toLowerCase();

  // High crowd events (100K+ attendees)
  if (name.includes('dreamforce') || name.includes('salesforce')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 170000,
      description: 'Salesforce annual conference - one of the largest tech conferences'
    };
  }

  if (name.includes('wwdc') || name.includes('worldwide developers')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 150000,
      description: 'Apple Worldwide Developers Conference'
    };
  }

  if (name.includes('ignite') && name.includes('microsoft')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 150000,
      description: 'Microsoft annual conference'
    };
  }

  if (name.includes('oracle') && (name.includes('openworld') || name.includes('cloudworld'))) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 120000,
      description: 'Oracle annual conference'
    };
  }

  // Moderate to high crowd events (50K-100K)
  if (name.includes('disrupt') || name.includes('techcrunch')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 80000,
      description: 'TechCrunch startup conference'
    };
  }

  if (name.includes('game developers') || name.includes('gdc')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 70000,
      description: 'Game Developers Conference'
    };
  }

  if (name.includes('rsa') && name.includes('conference')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 60000,
      description: 'RSA cybersecurity conference'
    };
  }

  // Check for general indicators of large events
  if (name.includes('expo') || name.includes('summit')) {
    return {
      crowdLevel: 'high',
      estimatedAttendance: 50000
    };
  }

  // Moderate crowd events (20K-50K)
  if (name.includes('conference') || name.includes('convention')) {
    return {
      crowdLevel: 'moderate',
      estimatedAttendance: 30000
    };
  }

  // Default to moderate for unknown events
  return {
    crowdLevel: 'moderate',
    estimatedAttendance: 25000
  };
}

/**
 * Clean event name
 */
function cleanEventName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s*/, '') // Remove leading numbers
    .trim();
}

/**
 * Parse events from HTML
 */
function parseEventsFromHTML(html: string): MosconeEvent[] {
  const events: MosconeEvent[] = [];
  const today = new Date();
  const sixMonthsFromNow = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));

  // Strip all HTML tags to get plain text and clean up whitespace
  let text = html.replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  // Remove multiple consecutive newlines and trim lines
  text = text.split('\n').map(line => line.trim()).filter(line => line).join('\n');

  // Pattern to match event blocks
  const eventPattern = /([^\n]+)\n([^\n]+)\n((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n]+\d{4})\s*-\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\n]+\d{4})\nVenue Type:\nMoscone\s+Center/gi;

  let match;
  while ((match = eventPattern.exec(text)) !== null) {
    const eventName = match[1].trim();
    const startDateStr = match[3].trim();
    const endDateStr = match[4].trim();

    // Parse dates
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    if (startDate && endDate && eventName.length > 3) {
      const eventStartDate = new Date(startDate);
      const eventEndDate = new Date(endDate);

      // Set end date to end of day (23:59:59) to include events happening on the end date
      eventEndDate.setUTCHours(23, 59, 59, 999);

      // Include events that are currently happening or will happen in the next 6 months
      // An event is relevant if it hasn't ended yet (endDate >= today) and starts within 6 months
      if (eventEndDate >= today && eventStartDate <= sixMonthsFromNow) {
        const { crowdLevel, estimatedAttendance, description } = estimateEventDetails(eventName);

        events.push({
          name: cleanEventName(eventName),
          startDate,
          endDate,
          description,
          estimatedAttendance,
          crowdLevel
        });
      }
    }
  }

  return events;
}

/**
 * Fetch Moscone events from SF Travel (with caching)
 */
export async function fetchMosconeEvents(): Promise<MosconeEvent[]> {
  // Check cache
  const now = Date.now();
  if (cachedEvents && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('Using cached Moscone events');
    return cachedEvents;
  }

  try {
    console.log('Fetching fresh Moscone events from SF Travel...');
    const response = await fetch(SF_TRAVEL_URL);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const events = parseEventsFromHTML(html);

    // Cache the results
    cachedEvents = events;
    cacheTimestamp = now;

    console.log(`Fetched ${events.length} Moscone events (cached for 24 hours)`);
    return events;
  } catch (error) {
    console.error('Error fetching Moscone events:', error);

    // Return cached events if available, even if expired
    if (cachedEvents) {
      console.log('Returning stale cached events due to fetch error');
      return cachedEvents;
    }

    // Return empty array on error
    return [];
  }
}

/**
 * Get Moscone events for a specific date (runtime version)
 */
export async function getMosconeEventsForDate(date: Date): Promise<VenueEvent[]> {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const mosconeEvents = await fetchMosconeEvents();
  const venueEvents: VenueEvent[] = [];

  for (const mosconeEvent of mosconeEvents) {
    if (dateStr >= mosconeEvent.startDate && dateStr <= mosconeEvent.endDate) {
      // Extract year, month, day from the date string
      const [year, month, day] = dateStr.split('-').map(Number);

      // Determine if we're in PDT (-07:00) or PST (-08:00)
      const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const pacificTestStr = testDate.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        timeZoneName: 'short'
      });
      const isPDT = pacificTestStr.includes('PDT');
      const tzOffset = isPDT ? '-07:00' : '-08:00';

      // Create ISO strings with explicit Pacific timezone
      const eventStart = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00${tzOffset}`);
      const eventEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T18:00:00${tzOffset}`);

      venueEvents.push({
        id: `moscone-${mosconeEvent.name.toLowerCase().replace(/\s+/g, '-')}-${dateStr}`,
        venueName: 'Moscone Center',
        eventName: mosconeEvent.name,
        eventType: 'other',
        startTime: eventStart.toISOString(),
        endTime: eventEnd.toISOString(),
        affectedStations: ['sf', '22nd'], // Moscone affects 4th & King and 22nd Street
        crowdLevel: mosconeEvent.crowdLevel
      });
    }
  }

  return venueEvents;
}
