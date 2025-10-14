// Chase Center Major Events
// Source: https://www.chasecenter.com/events or https://www.nba.com/warriors/schedule
// This file tracks major Warriors games and concerts at Chase Center
// that may not appear on Ticketmaster or need to be highlighted

import { VenueEvent } from './types';

export interface ChaseCenterEvent {
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM in 24-hour format (Pacific Time)
  endTime?: string; // HH:MM in 24-hour format (Pacific Time), optional
  eventType: 'basketball' | 'concert' | 'other';
  crowdLevel: 'low' | 'moderate' | 'high';
}

// Known major Chase Center events
// Update this list with Warriors HOME games and concerts at Chase Center
// Note: Only add games/events that are AT Chase Center in San Francisco, not away games
export const knownChaseCenterEvents: ChaseCenterEvent[] = [
  // Add events here as they are announced
  // Example format:
  // {
  //   name: 'Warriors vs Celtics',
  //   date: '2025-11-15',
  //   startTime: '19:00', // 7:00 PM
  //   eventType: 'basketball',
  //   crowdLevel: 'high'
  // },
];

/**
 * Check if a given date has any Chase Center events
 */
export function getChaseCenterEventsForDate(date: Date): VenueEvent[] {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const events: VenueEvent[] = [];

  for (const chaseCenterEvent of knownChaseCenterEvents) {
    if (dateStr === chaseCenterEvent.date) {
      // Extract year, month, day from the date string
      const [year, month, day] = dateStr.split('-').map(Number);

      // Parse start time
      const [startHour, startMinute] = chaseCenterEvent.startTime.split(':').map(Number);

      // Determine if we're in PDT (-07:00) or PST (-08:00)
      const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      const pacificTestStr = testDate.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        timeZoneName: 'short'
      });
      const isPDT = pacificTestStr.includes('PDT');
      const tzOffset = isPDT ? '-07:00' : '-08:00';

      // Create ISO strings with explicit Pacific timezone
      const eventStart = new Date(
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}:00${tzOffset}`
      );

      // Calculate end time (default to 2.5 hours for basketball, 3 hours for concerts)
      let eventEnd: Date;
      if (chaseCenterEvent.endTime) {
        const [endHour, endMinute] = chaseCenterEvent.endTime.split(':').map(Number);
        eventEnd = new Date(
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00${tzOffset}`
        );
      } else {
        const durationHours = chaseCenterEvent.eventType === 'basketball' ? 2.5 : 3;
        eventEnd = new Date(eventStart.getTime() + durationHours * 60 * 60 * 1000);
      }

      events.push({
        id: `chase-center-${chaseCenterEvent.name.toLowerCase().replace(/\s+/g, '-')}-${dateStr}`,
        venueName: 'Chase Center',
        eventName: chaseCenterEvent.name,
        eventType: chaseCenterEvent.eventType,
        startTime: eventStart.toISOString(),
        endTime: eventEnd.toISOString(),
        affectedStations: ['sf', '22nd'], // Chase Center affects 4th & King and 22nd Street
        crowdLevel: chaseCenterEvent.crowdLevel
      });
    }
  }

  return events;
}

/**
 * Get all Chase Center events in a date range
 */
export function getChaseCenterEventsInRange(startDate: Date, endDate: Date): VenueEvent[] {
  const events: VenueEvent[] = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    events.push(...getChaseCenterEventsForDate(current));
    current.setDate(current.getDate() + 1);
  }

  return events;
}
