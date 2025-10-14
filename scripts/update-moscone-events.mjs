#!/usr/bin/env node

/**
 * Moscone Events Update Script
 *
 * This script helps you update Moscone Center events by providing
 * the current event data and allowing you to add new ones.
 *
 * Usage:
 *   node scripts/update-moscone-events.mjs
 *
 * The script will:
 * 1. Show you current events in lib/moscone-events.ts
 * 2. Provide examples of upcoming events from SF Travel (you verify them)
 * 3. Generate an updated moscone-events.ts file
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../lib/moscone-events.ts');

// Fetch page and extract text
async function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Suggested events based on current knowledge (you verify these manually)
const suggestedEvents = [
  {
    name: 'Dreamforce 2025',
    startDate: '2025-10-14',
    endDate: '2025-10-16',
    description: 'Salesforce annual conference - one of the largest tech conferences',
    estimatedAttendance: 170000,
    crowdLevel: 'high'
  },
  {
    name: 'PyTorch Conference 2025',
    startDate: '2025-10-21',
    endDate: '2025-10-23',
    estimatedAttendance: 30000,
    crowdLevel: 'moderate'
  },
  {
    name: 'TCT Annual Conference 2025',
    startDate: '2025-10-25',
    endDate: '2025-10-28',
    estimatedAttendance: 25000,
    crowdLevel: 'moderate'
  },
  {
    name: 'TechCrunch Disrupt 2025',
    startDate: '2025-10-27',
    endDate: '2025-10-29',
    description: 'TechCrunch startup conference',
    estimatedAttendance: 80000,
    crowdLevel: 'high'
  },
  {
    name: 'Microsoft Ignite 2025',
    startDate: '2025-11-17',
    endDate: '2025-11-21',
    description: 'Microsoft annual conference',
    estimatedAttendance: 150000,
    crowdLevel: 'high'
  }
];

// Generate TypeScript file content
function generateTypeScriptFile(events) {
  const header = `// Moscone Center Major Events
// Source: https://www.moscone.com/events
// This file tracks major conventions and conferences at Moscone Center
// that significantly impact Caltrain ridership but may not be on Ticketmaster
//
// ⚠️ Last updated: ${new Date().toISOString().split('T')[0]}
// To update this file, run: node scripts/update-moscone-events.mjs

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
// Update this list periodically by running: node scripts/update-moscone-events.mjs
export const knownMosconeEvents: MosconeEvent[] = [
`;

  const eventsCode = events.map(event => {
    return `  {
    name: '${event.name}',
    startDate: '${event.startDate}',
    endDate: '${event.endDate}',${event.description ? `\n    description: '${event.description}',` : ''}
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
  console.log('\n🎯 Moscone Center Events Update Helper\n');
  console.log('This script will help you update the Moscone events list.');
  console.log('═'.repeat(80) + '\n');

  // Show current events
  console.log('📋 CURRENT EVENTS in lib/moscone-events.ts:\n');
  try {
    const currentFile = fs.readFileSync(OUTPUT_FILE, 'utf8');
    const eventMatches = currentFile.match(/{\s*name:.*?}/gs);
    if (eventMatches) {
      eventMatches.forEach((match, i) => {
        const nameMatch = match.match(/name:\s*'([^']+)'/);
        const startMatch = match.match(/startDate:\s*'([^']+)'/);
        const endMatch = match.match(/endDate:\s*'([^']+)'/);
        if (nameMatch && startMatch && endMatch) {
          console.log(`${i + 1}. ${nameMatch[1]}`);
          console.log(`   ${startMatch[1]} to ${endMatch[1]}\n`);
        }
      });
    }
  } catch (error) {
    console.log('   (No current events file found)\n');
  }

  console.log('─'.repeat(80) + '\n');
  console.log('🔍 SUGGESTED UPCOMING EVENTS:\n');
  console.log('(Based on SF Travel convention calendar - please verify dates)\n');

  suggestedEvents.forEach((event, i) => {
    console.log(`${i + 1}. ${event.name}`);
    console.log(`   Dates: ${event.startDate} to ${event.endDate}`);
    console.log(`   Crowd: ${event.crowdLevel} (est. ${event.estimatedAttendance.toLocaleString()} attendees)`);
    if (event.description) {
      console.log(`   Info: ${event.description}`);
    }
    console.log();
  });

  console.log('─'.repeat(80) + '\n');
  console.log('📌 To verify these dates, visit:');
  console.log('   https://portal.sftravel.com/calendar_public/home_sfdc.cfm');
  console.log('   https://www.moscone.com/events\n');

  const answer = await question('Generate lib/moscone-events.ts with these events? (y/n): ');

  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    const tsContent = generateTypeScriptFile(suggestedEvents);
    fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');

    console.log(`\n✅ Successfully updated ${OUTPUT_FILE}\n`);
    console.log('📋 Next steps:');
    console.log('   1. Review the changes: git diff lib/moscone-events.ts');
    console.log('   2. Verify dates at https://portal.sftravel.com/calendar_public/home_sfdc.cfm');
    console.log('   3. Adjust crowd levels or attendance if needed');
    console.log('   4. Test the app: npm run dev');
    console.log('   5. Commit: git add lib/moscone-events.ts && git commit -m "Update Moscone events"\n');
  } else {
    console.log('\n❌ Cancelled. No changes made.\n');
  }
}

main().catch(console.error);
