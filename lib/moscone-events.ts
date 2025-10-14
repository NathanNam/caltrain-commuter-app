// Moscone Center Major Events
// Source: https://www.moscone.com/events
// This file tracks major conventions and conferences at Moscone Center
// that significantly impact Caltrain ridership but may not be on Ticketmaster

import { VenueEvent } from './types';

export interface MosconeEvent {
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  description?: string;
  estimatedAttendance?: number;
  crowdLevel: 'low' | 'moderate' | 'high';
}

// Known major Moscone Center events
// Update this list periodically from https://www.moscone.com/events
export const knownMosconeEvents: MosconeEvent[] = [
  {
    name: 'Dreamforce 2025',
    startDate: '2025-10-13',
    endDate: '2025-10-17',
    description: 'Salesforce annual conference - one of the largest tech conferences',
    estimatedAttendance: 170000,
    crowdLevel: 'high'
  },
  // Add more events here as they are announced
  // Example format:
  // {
  //   name: 'Oracle OpenWorld',
  //   startDate: '2025-09-22',
  //   endDate: '2025-09-25',
  //   description: 'Oracle\'s annual conference',
  //   estimatedAttendance: 60000,
  //   crowdLevel: 'high'
  // },
];

/**
 * Check if a given date falls within any Moscone Center event
 */
export function getMosconeEventsForDate(date: Date): VenueEvent[] {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const events: VenueEvent[] = [];

  for (const mosconeEvent of knownMosconeEvents) {
    if (dateStr >= mosconeEvent.startDate && dateStr <= mosconeEvent.endDate) {
      // Create event with morning (8 AM) and evening (6 PM) times in Pacific Time
      // Conventions typically run all day
      // We need to create dates explicitly in Pacific Time to avoid timezone issues

      // Extract year, month, day from the date string
      const [year, month, day] = dateStr.split('-').map(Number);

      // Create dates in Pacific Time by using ISO string with Pacific offset
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

      events.push({
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

  return events;
}

/**
 * Get all Moscone events in a date range
 */
export function getMosconeEventsInRange(startDate: Date, endDate: Date): VenueEvent[] {
  const events: VenueEvent[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    events.push(...getMosconeEventsForDate(current));
    current.setDate(current.getDate() + 1);
  }

  return events;
}
