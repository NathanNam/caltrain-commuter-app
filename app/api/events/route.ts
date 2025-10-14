import { NextRequest, NextResponse } from 'next/server';
import { VenueEvent } from '@/lib/types';
import { ticketmasterVenueIds } from '@/lib/venues';
import { getMosconeEventsForDate as getMosconeEventsRuntime } from '@/lib/moscone-events-fetcher';
import { getChaseCenterEventsForDate } from '@/lib/chase-center-events';

// This API fetches events from multiple venues near Caltrain stations
// Supports: Oracle Park, Chase Center, Bill Graham, The Fillmore, and more
//
// Moscone events are automatically fetched at runtime from SF Travel (cached for 24h)
// Chase Center events are manually maintained in chase-center-events.ts

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const dateObj = new Date(date);

  // Fetch Moscone events at runtime (automatically fetched from SF Travel, cached for 24h)
  const mosconeEvents = await getMosconeEventsRuntime(dateObj);

  // Get Chase Center events from manually maintained list
  const chaseCenterEvents = getChaseCenterEventsForDate(dateObj);

  // Check if Ticketmaster API key is configured
  if (process.env.TICKETMASTER_API_KEY) {
    try {
      const ticketmasterEvents = await fetchTicketmasterEvents(date);

      // Combine Ticketmaster events with manually maintained events
      // Remove duplicates by checking event names and venues
      const allEvents = [...ticketmasterEvents];

      // Add Moscone events if not already in Ticketmaster results
      for (const mosconeEvent of mosconeEvents) {
        const isDuplicate = ticketmasterEvents.some(
          e => e.venueName.toLowerCase().includes('moscone') &&
               e.eventName === mosconeEvent.eventName
        );
        if (!isDuplicate) {
          allEvents.push(mosconeEvent);
        }
      }

      // Add Chase Center events if not already in Ticketmaster results
      for (const chaseCenterEvent of chaseCenterEvents) {
        const isDuplicate = ticketmasterEvents.some(
          e => e.venueName.toLowerCase().includes('chase') &&
               e.eventName === chaseCenterEvent.eventName
        );
        if (!isDuplicate) {
          allEvents.push(chaseCenterEvent);
        }
      }

      return NextResponse.json({
        events: allEvents,
        isMockData: false
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' // Cache for 30 min
        }
      });
    } catch (error) {
      console.error('Ticketmaster API error:', error);
      // Fall back to mock data + Moscone events if API fails
    }
  }

  // If no API key or API fails, return mock data + manually maintained events
  console.log('Using mock event data - configure TICKETMASTER_API_KEY for real events');
  const mockEvents = generateMockEvents(date);

  // Combine mock events with manually maintained events (avoid duplicates)
  const allEvents = [...mockEvents];

  // Add Moscone events
  for (const mosconeEvent of mosconeEvents) {
    const isDuplicate = mockEvents.some(
      e => e.venueName === 'Moscone Center' && e.eventName === mosconeEvent.eventName
    );
    if (!isDuplicate) {
      allEvents.push(mosconeEvent);
    }
  }

  // Add Chase Center events
  for (const chaseCenterEvent of chaseCenterEvents) {
    const isDuplicate = mockEvents.some(
      e => e.venueName === 'Chase Center' && e.eventName === chaseCenterEvent.eventName
    );
    if (!isDuplicate) {
      allEvents.push(chaseCenterEvent);
    }
  }

  return NextResponse.json({
    events: allEvents,
    isMockData: true
  }, {
    headers: {
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600' // Cache for 30 min
    }
  });
}

// Mock event generator - generates sample events for demonstration
// NOTE: Moscone Center events are now handled by the moscone-events.ts data file
function generateMockEvents(date: string): VenueEvent[] {
  const events: VenueEvent[] = [];
  const today = new Date();
  const hour = today.getHours();
  const month = today.getMonth(); // 0-11

  // Oracle Park (SF Giants) - affects SF, 22nd Street, Bayshore stations
  // Giants games typically at 1:05 PM or 6:45 PM during baseball season (April-October)
  const isBaseballSeason = month >= 3 && month <= 9; // April (3) to October (9)

  if (isBaseballSeason && hour < 20) {
    const gameTime = new Date(today);
    gameTime.setHours(hour < 14 ? 13 : 18, hour < 14 ? 5 : 45, 0);

    events.push({
      id: 'mock-oracle-park-1',
      venueName: 'Oracle Park',
      eventName: 'SF Giants vs LA Dodgers',
      eventType: 'baseball',
      startTime: gameTime.toISOString(),
      endTime: new Date(gameTime.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      affectedStations: ['sf', '22nd', 'bayshore'],
      crowdLevel: 'high'
    });
  }

  // Chase Center (Golden State Warriors) - affects SF, 22nd Street
  // Basketball games typically at 7:00 PM or 7:30 PM during NBA season (October-June)
  const isBasketballSeason = month >= 9 || month <= 5; // October (9) to June (5)

  if (isBasketballSeason && hour >= 15 && hour < 22) {
    const gameTime = new Date(today);
    gameTime.setHours(19, 30, 0);

    events.push({
      id: 'mock-chase-center-1',
      venueName: 'Chase Center',
      eventName: 'Golden State Warriors vs Lakers',
      eventType: 'basketball',
      startTime: gameTime.toISOString(),
      endTime: new Date(gameTime.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
      affectedStations: ['sf', '22nd'],
      crowdLevel: 'high'
    });
  }

  // Concert at Chase Center (happens year-round, typically on weekends)
  if (hour >= 16 && hour < 21 && today.getDay() === 5) { // Friday
    const concertTime = new Date(today);
    concertTime.setHours(20, 0, 0);

    events.push({
      id: 'mock-chase-center-concert',
      venueName: 'Chase Center',
      eventName: 'Concert: Taylor Swift',
      eventType: 'concert',
      startTime: concertTime.toISOString(),
      endTime: new Date(concertTime.getTime() + 3 * 60 * 60 * 1000).toISOString(),
      affectedStations: ['sf', '22nd'],
      crowdLevel: 'high'
    });
  }

  return events;
}

// Fetch events from Ticketmaster API for all SF venues
async function fetchTicketmasterEvents(date: string): Promise<VenueEvent[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) return [];

  const events: VenueEvent[] = [];

  // All venue IDs to check
  const venueIds = Object.values(ticketmasterVenueIds);

  try {
    // Fetch events for all venues (you can parallelize this for better performance)
    const promises = venueIds.map(venueId =>
      fetch(
        `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${apiKey}&venueId=${venueId}&startDateTime=${date}T00:00:00Z&endDateTime=${date}T23:59:59Z&size=20`,
        { next: { revalidate: 1800 } }
      ).then(res => res.ok ? res.json() : null)
    );

    const results = await Promise.all(promises);

    // Process results from all venues
    for (const result of results) {
      if (!result || !result._embedded?.events) continue;

      for (const event of result._embedded.events) {
        const eventType = determineEventType(event);
        const venueName = event._embedded?.venues?.[0]?.name || 'Unknown Venue';

        events.push({
          id: event.id,
          venueName: venueName,
          eventName: event.name,
          eventType,
          startTime: event.dates.start.dateTime || event.dates.start.localDate,
          endTime: undefined, // Ticketmaster doesn't always provide end times
          affectedStations: determineAffectedStations(venueName),
          crowdLevel: determineCrowdLevel(event, venueName)
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Ticketmaster events:', error);
    return [];
  }
}

// Helper: Determine event type from Ticketmaster classification
function determineEventType(event: any): 'baseball' | 'basketball' | 'concert' | 'other' {
  const classifications = event.classifications || [];

  for (const classification of classifications) {
    const segment = classification.segment?.name?.toLowerCase() || '';
    const genre = classification.genre?.name?.toLowerCase() || '';

    if (segment.includes('sports')) {
      if (genre.includes('baseball')) return 'baseball';
      if (genre.includes('basketball')) return 'basketball';
    }

    if (segment.includes('music') || segment.includes('concert')) {
      return 'concert';
    }
  }

  return 'other';
}

// Helper: Determine affected stations based on venue
function determineAffectedStations(venueName: string): string[] {
  const venue = venueName.toLowerCase();

  // Oracle Park affects SF, 22nd, and Bayshore
  if (venue.includes('oracle park')) {
    return ['sf', '22nd', 'bayshore'];
  }

  // Chase Center affects SF and 22nd
  if (venue.includes('chase center')) {
    return ['sf', '22nd'];
  }

  // Most other SF venues primarily affect 4th & King
  return ['sf'];
}

// Helper: Determine crowd level based on event and venue
function determineCrowdLevel(event: any, venueName: string): 'low' | 'moderate' | 'high' {
  const venue = venueName.toLowerCase();

  // Large stadiums = high crowd
  if (venue.includes('oracle park') || venue.includes('chase center')) {
    return 'high';
  }

  // Moscone Center conventions = HIGH crowd (Dreamforce, WWDC, etc.)
  // Major tech conferences can bring 100K+ attendees over multiple days
  if (venue.includes('moscone')) {
    // Check for major conventions by looking at event name
    const eventName = event.name?.toLowerCase() || '';
    if (eventName.includes('dreamforce') ||
        eventName.includes('wwdc') ||
        eventName.includes('oracle') ||
        eventName.includes('salesforce') ||
        eventName.includes('conference')) {
      return 'high';
    }
    return 'moderate'; // Smaller conventions still cause moderate crowds
  }

  // Check if it's a popular event (look at priceRanges)
  const priceRanges = event.priceRanges || [];
  if (priceRanges.length > 0 && priceRanges[0].max > 200) {
    return 'high';
  }

  // Check event classifications for major events
  const classifications = event.classifications || [];
  for (const classification of classifications) {
    if (classification.genre?.name?.toLowerCase().includes('major league')) {
      return 'high';
    }
  }

  // Medium-sized venues = moderate
  return 'moderate';
}

/*
  TO INTEGRATE WITH REAL APIS - MULTIPLE OPTIONS:

  ============================================
  OPTION 1: Ticketmaster Discovery API (FREE - No approval needed)
  ============================================
  - Sign up: https://developer.ticketmaster.com/products-and-docs/apis/getting-started/
  - Get API key instantly after registration
  - Free tier: 5000 API calls/day
  - IMPORTANT: Use the "Consumer Key" (NOT the Consumer Secret)

  Environment variable:
    TICKETMASTER_API_KEY=your_consumer_key_here

  Example for Oracle Park:
    const response = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${process.env.TICKETMASTER_API_KEY}&venueId=KovZpZAEAJvA&startDateTime=${date}T00:00:00Z`,
      { next: { revalidate: 1800 } }
    );

  Venue IDs:
    - Oracle Park (SF Giants): KovZpZAEAJvA
    - Chase Center: KovZpZAJ7dEA

  ============================================
  OPTION 2: MLB Stats API (FREE - No key needed!)
  ============================================
  - Official MLB API - no registration required
  - Perfect for SF Giants games at Oracle Park

  Example:
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=137&startDate=${date}&endDate=${date}`,
      { next: { revalidate: 1800 } }
    );

  Team IDs:
    - SF Giants: 137

  Returns game times, opponents, and game status.

  ============================================
  OPTION 3: NBA API (FREE - No key needed!)
  ============================================
  - For Golden State Warriors games at Chase Center
  - Using the stats.nba.com endpoint

  Example:
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const response = await fetch(
      `https://stats.nba.com/stats/scoreboardv3?GameDate=${today}&LeagueID=00`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        next: { revalidate: 1800 }
      }
    );

  Filter response for team "Golden State Warriors"

  ============================================
  OPTION 4: SeatGeek API (Requires approval)
  ============================================
  - Sign up: https://platform.seatgeek.com/
  - Covers all venues and events

  Environment variables:
    SEATGEEK_CLIENT_ID=your_client_id
    SEATGEEK_CLIENT_SECRET=your_client_secret

  Example:
    const response = await fetch(
      `https://api.seatgeek.com/2/events?venue.id=32&datetime_local.gte=${date}&client_id=${process.env.SEATGEEK_CLIENT_ID}`,
      { next: { revalidate: 1800 } }
    );

  ============================================
  RECOMMENDED APPROACH:
  ============================================
  Use MLB API for Giants games + Ticketmaster for everything else
  - MLB API is free, no key needed, very reliable for baseball
  - Ticketmaster has instant approval for concerts, Warriors games, etc.

  ============================================
  MOSCONE CENTER EVENTS
  ============================================
  Moscone Center hosts major conventions and conferences that don't
  appear on Ticketmaster (Dreamforce, Oracle OpenWorld, WWDC, etc.)

  These events are tracked in lib/moscone-events.ts - a manually maintained
  list of known major conventions.

  To add new Moscone events:
  1. Check https://www.moscone.com/events for upcoming conventions
  2. Update lib/moscone-events.ts with event details
  3. Events will automatically appear in the app

  Major conventions can bring 100K+ attendees and significantly impact
  Caltrain ridership, especially at 4th & King and 22nd Street stations.
*/
