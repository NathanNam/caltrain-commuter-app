#!/usr/bin/env node

/**
 * Moscone Events Update Script
 *
 * This script fetches upcoming Moscone Center events from SF Travel's convention calendar
 * and generates an updated lib/moscone-events.ts file.
 *
 * Usage:
 *   node scripts/update-moscone-events.js
 *
 * The script will:
 * 1. Fetch events from SF Travel's public convention calendar
 * 2. Parse event data (name, dates, etc.)
 * 3. Generate a new moscone-events.ts file with the updated events
 * 4. Prompt you to review and confirm the changes
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const SF_TRAVEL_URL = 'https://portal.sftravel.com/calendar_public/home_sfdc.cfm';
const OUTPUT_FILE = path.join(__dirname, '../lib/moscone-events.ts');

// Estimate crowd levels based on event names/types
function estimateCrowdLevel(eventName) {
  const name = eventName.toLowerCase();

  // High crowd events (100K+ attendees)
  if (name.includes('dreamforce') ||
      name.includes('wwdc') ||
      name.includes('oracle') ||
      name.includes('salesforce') ||
      name.includes('ignite')) {
    return { crowdLevel: 'high', estimatedAttendance: 150000 };
  }

  // Moderate to high crowd events (50K-100K)
  if (name.includes('disrupt') ||
      name.includes('techcrunch') ||
      name.includes('expo') ||
      name.includes('summit')) {
    return { crowdLevel: 'high', estimatedAttendance: 80000 };
  }

  // Moderate crowd events (20K-50K)
  if (name.includes('conference') ||
      name.includes('convention')) {
    return { crowdLevel: 'moderate', estimatedAttendance: 30000 };
  }

  // Default to moderate for unknown events
  return { crowdLevel: 'moderate', estimatedAttendance: 25000 };
}

// Parse date from various formats
function parseDate(dateStr) {
  // Handle formats like "Oct 14, 2025" or "10/14/2025"
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    console.error(`Unable to parse date: ${dateStr}`);
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Fetch events from SF Travel
async function fetchMosconeEvents() {
  return new Promise((resolve, reject) => {
    https.get(SF_TRAVEL_URL, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const events = parseEventsFromHTML(data);
          resolve(events);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

// Parse events from HTML (basic regex-based parsing)
function parseEventsFromHTML(html) {
  const events = [];

  // This is a simple parser - you may need to adjust based on actual HTML structure
  // Look for patterns like event rows in the calendar
  const eventPattern = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<\/tr>/gi;

  let match;
  const today = new Date();
  const sixMonthsFromNow = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));

  while ((match = eventPattern.exec(html)) !== null) {
    const [, nameCell, startCell, endCell] = match;

    // Clean HTML tags
    const eventName = nameCell.replace(/<[^>]*>/g, '').trim();
    const startDateStr = startCell.replace(/<[^>]*>/g, '').trim();
    const endDateStr = endCell.replace(/<[^>]*>/g, '').trim();

    // Only process if it looks like a Moscone event
    if (!eventName || !startDateStr || eventName.length < 3) {
      continue;
    }

    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    if (!startDate || !endDate) {
      continue;
    }

    // Only include events in the next 6 months
    const eventStartDate = new Date(startDate);
    if (eventStartDate < today || eventStartDate > sixMonthsFromNow) {
      continue;
    }

    const { crowdLevel, estimatedAttendance } = estimateCrowdLevel(eventName);

    events.push({
      name: eventName,
      startDate,
      endDate,
      estimatedAttendance,
      crowdLevel
    });
  }

  return events;
}

// Generate TypeScript file content
function generateTypeScriptFile(events) {
  const header = `// Moscone Center Major Events
// Source: https://www.moscone.com/events
// This file tracks major conventions and conferences at Moscone Center
// that significantly impact Caltrain ridership but may not be on Ticketmaster
//
// ⚠️ AUTO-GENERATED FILE - Last updated: ${new Date().toISOString().split('T')[0]}
// To update this file, run: node scripts/update-moscone-events.js

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
// Update this list periodically by running: node scripts/update-moscone-events.js
export const knownMosconeEvents: MosconeEvent[] = [
`;

  const eventsCode = events.map(event => {
    const description = event.name.includes('Dreamforce')
      ? 'Salesforce annual conference - one of the largest tech conferences'
      : event.name.includes('Ignite')
      ? 'Microsoft annual conference'
      : event.name.includes('Disrupt')
      ? 'TechCrunch startup conference'
      : undefined;

    return `  {
    name: '${event.name}',
    startDate: '${event.startDate}',
    endDate: '${event.endDate}',${description ? `\n    description: '${description}',` : ''}
    estimatedAttendance: ${event.estimatedAttendance},
    crowdLevel: '${event.crowdLevel}'
  }`;
  }).join(',\n');

  const functions = `
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
      const eventStart = new Date(\`\${year}-\${String(month).padStart(2, '0')}-\${String(day).padStart(2, '0')}T08:00:00\${tzOffset}\`);
      const eventEnd = new Date(\`\${year}-\${String(month).padStart(2, '0')}-\${String(day).padStart(2, '0')}T18:00:00\${tzOffset}\`);

      events.push({
        id: \`moscone-\${mosconeEvent.name.toLowerCase().replace(/\\s+/g, '-')}-\${dateStr}\`,
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
`;

  return header + eventsCode + functions;
}

// Main execution
async function main() {
  console.log('🔍 Fetching Moscone Center events from SF Travel...\n');

  try {
    const events = await fetchMosconeEvents();

    if (events.length === 0) {
      console.log('⚠️  No events found. The HTML structure may have changed.');
      console.log('Please check the SF Travel website manually: ' + SF_TRAVEL_URL);
      process.exit(1);
    }

    console.log(`✅ Found ${events.length} upcoming events:\n`);

    events.forEach((event, i) => {
      console.log(`${i + 1}. ${event.name}`);
      console.log(`   Dates: ${event.startDate} to ${event.endDate}`);
      console.log(`   Crowd Level: ${event.crowdLevel} (est. ${event.estimatedAttendance.toLocaleString()} attendees)`);
      console.log();
    });

    console.log('📝 Generating TypeScript file...\n');

    const tsContent = generateTypeScriptFile(events);

    // Show preview
    console.log('Preview of generated file:');
    console.log('─'.repeat(80));
    console.log(tsContent.split('\n').slice(0, 30).join('\n'));
    console.log('... (truncated)');
    console.log('─'.repeat(80));
    console.log();

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Write this to lib/moscone-events.ts? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');
        console.log(`\n✅ Successfully updated ${OUTPUT_FILE}`);
        console.log('\n📋 Next steps:');
        console.log('   1. Review the changes: git diff lib/moscone-events.ts');
        console.log('   2. Test the app: npm run dev');
        console.log('   3. Commit the changes: git add lib/moscone-events.ts && git commit -m "Update Moscone events"');
      } else {
        console.log('\n❌ Cancelled. No changes made.');
      }
      readline.close();
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  1. Your internet connection');
    console.error('  2. The SF Travel website is accessible: ' + SF_TRAVEL_URL);
    process.exit(1);
  }
}

main();
