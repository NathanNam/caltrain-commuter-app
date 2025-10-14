#!/usr/bin/env node

/**
 * Moscone Events Auto-Update Script
 *
 * This script AUTOMATICALLY fetches upcoming Moscone Center events from
 * SF Travel's convention calendar and generates an updated lib/moscone-events.ts file.
 *
 * Usage:
 *   node scripts/update-moscone-events-auto.mjs
 *
 * No manual research needed - just run it!
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SF_TRAVEL_URL = 'https://portal.sftravel.com/calendar_public/home_sfdc.cfm';
const OUTPUT_FILE = path.join(__dirname, '../lib/moscone-events.ts');

// Fetch page content
async function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse events from HTML (plain text format)
function parseEventsFromHTML(html) {
  const events = [];
  const today = new Date();
  const sixMonthsFromNow = new Date(today.getTime() + (180 * 24 * 60 * 60 * 1000));

  // Strip all HTML tags to get plain text and clean up whitespace
  let text = html.replace(/<[^>]*>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  // Remove multiple consecutive newlines and trim lines
  text = text.split('\n').map(line => line.trim()).filter(line => line).join('\n');

  // Pattern to match event blocks with flexible whitespace:
  // Event Name
  // Organization
  // StartDate - EndDate
  // Venue Type: Moscone Center
  //
  // Example after cleanup:
  // Dreamforce 2025
  // Salesforce, Inc.
  // Oct 14, 2025 - Oct 16, 2025
  // Venue Type:
  // Moscone Center

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

      // Only include upcoming events (within next 6 months)
      if (eventStartDate >= today && eventStartDate <= sixMonthsFromNow) {
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

// Clean event name
function cleanEventName(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/^\d+\s*/, '') // Remove leading numbers
    .trim();
}

// Parse date from various formats
function parseDate(dateStr) {
  // Remove extra whitespace
  dateStr = dateStr.trim();

  // Try parsing common formats
  // "Oct 14, 2025", "10/14/2025", "October 14, 2025"
  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    // Try alternate parsing
    const patterns = [
      /(\w+)\s+(\d+),?\s+(\d{4})/, // "Oct 14, 2025"
      /(\d+)\/(\d+)\/(\d{4})/,      // "10/14/2025"
    ];

    for (const pattern of patterns) {
      const match = dateStr.match(pattern);
      if (match) {
        const testDate = new Date(dateStr);
        if (!isNaN(testDate.getTime())) {
          const year = testDate.getFullYear();
          const month = String(testDate.getMonth() + 1).padStart(2, '0');
          const day = String(testDate.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
    }
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

// Estimate event details based on name
function estimateEventDetails(eventName) {
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

// Generate TypeScript file content
function generateTypeScriptFile(events) {
  const header = `// Moscone Center Major Events
// Source: https://www.moscone.com/events
// This file tracks major conventions and conferences at Moscone Center
// that significantly impact Caltrain ridership but may not be on Ticketmaster
//
// ⚠️ AUTO-GENERATED FILE - Last updated: ${new Date().toISOString().split('T')[0]}
// To update this file, run: node scripts/update-moscone-events-auto.mjs

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
// Update this list by running: node scripts/update-moscone-events-auto.mjs
export const knownMosconeEvents: MosconeEvent[] = [
`;

  const eventsCode = events.map(event => {
    return `  {
    name: '${event.name.replace(/'/g, "\\'")}',
    startDate: '${event.startDate}',
    endDate: '${event.endDate}',${event.description ? `\n    description: '${event.description.replace(/'/g, "\\'")}',` : ''}
    estimatedAttendance: ${event.estimatedAttendance},
    crowdLevel: '${event.crowdLevel}'
  }`;
  }).join(',\n');

  const footer = `
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

  return header + eventsCode + footer;
}

// Interactive prompt helper
function question(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Main execution
async function main() {
  console.log('\n🎯 Moscone Center Events Auto-Update\n');
  console.log('Fetching events from SF Travel convention calendar...');
  console.log('═'.repeat(80) + '\n');

  try {
    // Fetch the page
    const html = await fetchPage(SF_TRAVEL_URL);

    // Parse events
    const events = parseEventsFromHTML(html);

    if (events.length === 0) {
      console.log('⚠️  No events found. This could mean:');
      console.log('   1. No upcoming Moscone events in the next 6 months');
      console.log('   2. The website HTML structure has changed');
      console.log('   3. Network issue or website temporarily unavailable\n');
      console.log('Please check manually at: ' + SF_TRAVEL_URL);
      process.exit(1);
    }

    console.log(`✅ Found ${events.length} upcoming Moscone Center events:\n`);

    events.forEach((event, i) => {
      console.log(`${i + 1}. ${event.name}`);
      console.log(`   Dates: ${event.startDate} to ${event.endDate}`);
      console.log(`   Crowd Level: ${event.crowdLevel} (est. ${event.estimatedAttendance.toLocaleString()} attendees)`);
      if (event.description) {
        console.log(`   Info: ${event.description}`);
      }
      console.log();
    });

    console.log('─'.repeat(80) + '\n');

    const answer = await question('Generate lib/moscone-events.ts with these events? (y/n): ');

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      const tsContent = generateTypeScriptFile(events);
      fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');

      console.log(`\n✅ Successfully updated ${OUTPUT_FILE}\n`);
      console.log('📋 Next steps:');
      console.log('   1. Review the changes: git diff lib/moscone-events.ts');
      console.log('   2. Test the app: npm run dev');
      console.log('   3. Commit: git add lib/moscone-events.ts && git commit -m "Update Moscone events"\n');
    } else {
      console.log('\n❌ Cancelled. No changes made.\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nPlease check:');
    console.error('  1. Your internet connection');
    console.error('  2. The SF Travel website is accessible: ' + SF_TRAVEL_URL);
    console.error('\nIf the problem persists, the website structure may have changed.');
    console.error('You can manually add events to lib/moscone-events.ts\n');
    process.exit(1);
  }
}

main().catch(console.error);
