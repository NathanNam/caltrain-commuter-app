// NHL Schedule Fetcher
// Fetches San Jose Sharks games from NHL API (free, no key required)
// Source: https://api-web.nhle.com/v1/club-schedule-season/SJS/
// Documentation: https://github.com/Zmalski/NHL-API-Reference

import { VenueEvent } from './types';

const SAN_JOSE_SHARKS_TEAM_CODE = 'SJS';

/**
 * Fetch Sharks games for a specific date
 * Uses NHL's free web API - no API key required
 */
export async function getSharksGamesForDate(date: Date): Promise<VenueEvent[]> {
  try {
    // Get the current season (e.g., 20252026 for 2025-26 season)
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11

    // NHL season runs from October (month 9) to June (month 5)
    // If it's October-December, use current year (e.g., 2025 -> 20252026)
    // If it's January-September, use previous year (e.g., 2025 -> 20242025)
    let season: string;
    if (month >= 9) {
      // October-December
      season = `${year}${year + 1}`;
    } else {
      // January-September
      season = `${year - 1}${year}`;
    }

    const response = await fetch(
      `https://api-web.nhle.com/v1/club-schedule-season/${SAN_JOSE_SHARKS_TEAM_CODE}/${season}`,
      { next: { revalidate: 1800 } } // Cache for 30 minutes
    );

    if (!response.ok) {
      console.error('NHL API error:', response.status);
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    // Get the target date string (YYYY-MM-DD) in Pacific Time
    // NHL API's gameDate field is already in local time (Pacific), so we need to match in Pacific
    const targetDateStr = date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split(',')[0]; // MM/DD/YYYY
    const [targetMonth, targetDay, targetYear] = targetDateStr.split('/');
    const targetDatePacific = `${targetYear}-${targetMonth}-${targetDay}`; // YYYY-MM-DD

    // Parse games from the games array
    if (data.games && Array.isArray(data.games)) {
      for (const game of data.games) {
        // Game date is in YYYY-MM-DD format (already in Pacific Time from NHL API)
        const gameDateStr = game.gameDate;

        // Only include games on the target date (in Pacific Time)
        if (gameDateStr !== targetDatePacific) continue;

        // Determine if this is a home game
        const homeTeam = game.homeTeam;
        const awayTeam = game.awayTeam;

        if (!homeTeam || !awayTeam) continue;

        const isSharksHome = homeTeam.abbrev === SAN_JOSE_SHARKS_TEAM_CODE;

        // Only include HOME games at SAP Center
        if (!isSharksHome) continue;

        // Get opponent name
        const opponentName = awayTeam.placeName?.default || awayTeam.abbrev || 'TBD';

        // Determine game type
        let gameType = '';
        if (game.gameType === 1) {
          gameType = ' (Preseason)';
        } else if (game.gameType === 3) {
          gameType = ' (Playoffs)';
        }

        // Parse game time (startTimeUTC is in ISO format)
        const gameDate = new Date(game.startTimeUTC);

        // Create event
        events.push({
          id: `nhl-sharks-${game.id}`,
          venueName: 'SAP Center',
          eventName: `Sharks vs ${opponentName}${gameType}`,
          eventType: 'other', // NHL doesn't have a specific icon, use 'other'
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 2.5 * 60 * 60 * 1000).toISOString(), // 2.5 hours duration
          affectedStations: ['diridon'], // SAP Center is across from San Jose Diridon station
          crowdLevel: 'high'
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Sharks schedule:', error);
    return [];
  }
}

/**
 * Get all Sharks games in a date range
 */
export async function getSharksGamesInRange(startDate: Date, endDate: Date): Promise<VenueEvent[]> {
  try {
    // Determine which season(s) to fetch
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth();

    let season: string;
    if (startMonth >= 9) {
      season = `${startYear}${startYear + 1}`;
    } else {
      season = `${startYear - 1}${startYear}`;
    }

    const response = await fetch(
      `https://api-web.nhle.com/v1/club-schedule-season/${SAN_JOSE_SHARKS_TEAM_CODE}/${season}`,
      { next: { revalidate: 1800 } }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    if (data.games && Array.isArray(data.games)) {
      for (const game of data.games) {
        const gameDate = new Date(game.startTimeUTC);

        // Only include games in the date range
        if (gameDate < startDate || gameDate > endDate) continue;

        const homeTeam = game.homeTeam;
        const awayTeam = game.awayTeam;

        if (!homeTeam || !awayTeam) continue;

        const isSharksHome = homeTeam.abbrev === SAN_JOSE_SHARKS_TEAM_CODE;

        // Only include HOME games
        if (!isSharksHome) continue;

        const opponentName = awayTeam.placeName?.default || awayTeam.abbrev || 'TBD';

        let gameType = '';
        if (game.gameType === 1) {
          gameType = ' (Preseason)';
        } else if (game.gameType === 3) {
          gameType = ' (Playoffs)';
        }

        events.push({
          id: `nhl-sharks-${game.id}`,
          venueName: 'SAP Center',
          eventName: `Sharks vs ${opponentName}${gameType}`,
          eventType: 'other',
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
          affectedStations: ['diridon'],
          crowdLevel: 'high'
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Sharks schedule range:', error);
    return [];
  }
}
