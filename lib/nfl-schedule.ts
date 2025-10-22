// NFL Schedule Fetcher
// Fetches SF 49ers games from ESPN NFL API (free, no key required)
// Source: https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/sf/schedule

import { VenueEvent } from './types';
import {
  fetchWithRetry,
  handleApiError,
  createSuccessResponse,
  ApiResponse,
  validateApiResponse,
  ESPNEventSchema
} from './error-handling';
import { z } from 'zod';

// Schema for ESPN NFL API response
const ESPNNFLResponseSchema = z.object({
  events: z.array(ESPNEventSchema).optional()
});

/**
 * Fetch 49ers games for a specific date
 * Uses ESPN's free NFL API - no API key required
 */
export async function get49ersGamesForDate(date: Date): Promise<ApiResponse<VenueEvent>> {
  try {
    const response = await fetchWithRetry(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/sf/schedule',
      { next: { revalidate: 1800 } } // Cache for 30 minutes
    );

    const rawData = await response.json();
    const data = validateApiResponse(rawData, ESPNNFLResponseSchema, 'ESPN NFL API');
    const events: VenueEvent[] = [];

    // Get the target date string (YYYY-MM-DD) in Pacific Time
    const targetDateStr = date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split(',')[0]; // MM/DD/YYYY
    const [targetMonth, targetDay, targetYear] = targetDateStr.split('/');
    const targetDatePacific = `${targetYear}-${targetMonth}-${targetDay}`;

    // Parse games from the events array
    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const gameDate = new Date(event.date);

        // Convert game time to Pacific Time date
        const gameDatePacific = gameDate.toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).split(',')[0]; // MM/DD/YYYY
        const [gameMonth, gameDay, gameYear] = gameDatePacific.split('/');
        const gameDateStr = `${gameYear}-${gameMonth}-${gameDay}`;

        // Only include games on the target date (in Pacific Time)
        if (gameDateStr !== targetDatePacific) continue;

        // Determine if this is a home game (49ers are at Levi's Stadium)
        const competition = event.competitions?.[0];
        if (!competition) continue;

        // Check if 49ers are the home team
        const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');

        const is49ersHome = homeTeam?.team?.abbreviation === 'SF';

        // Only include HOME games at Levi's Stadium
        if (!is49ersHome) continue;

        // Get opponent name
        const opponentName = awayTeam?.team?.displayName || 'TBD';

        // Determine if this is preseason, regular season, or playoffs
        let gameType = '';
        if (event.season?.type === 1) {
          gameType = ' (Preseason)';
        } else if (event.season?.type === 3) {
          gameType = ' (Playoffs)';
        }

        // Create event
        events.push({
          id: `nfl-49ers-${event.id}`,
          venueName: "Levi's Stadium",
          eventName: `49ers vs ${opponentName}${gameType}`,
          eventType: 'other', // NFL doesn't have a specific icon, use 'other'
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 3.5 * 60 * 60 * 1000).toISOString(), // 3.5 hours duration
          affectedStations: ['mountain-view', 'sunnyvale', 'santa-clara'], // Levi's Stadium - fans use Mountain View Caltrain + VTA
          crowdLevel: 'high'
        });
      }
    }

    return createSuccessResponse(events, `Found ${events.length} 49ers games for ${date.toDateString()}`);
  } catch (error) {
    return handleApiError(error, 'get49ersGamesForDate');
  }
}

/**
 * Get all 49ers games in a date range
 */
export async function get49ersGamesInRange(startDate: Date, endDate: Date): Promise<ApiResponse<VenueEvent>> {
  try {
    const response = await fetchWithRetry(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/sf/schedule',
      { next: { revalidate: 1800 } }
    );

    const rawData = await response.json();
    const data = validateApiResponse(rawData, ESPNNFLResponseSchema, 'ESPN NFL API');
    const events: VenueEvent[] = [];

    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        if (!event.date) continue;

        const gameDate = new Date(event.date);
        if (isNaN(gameDate.getTime())) continue; // Skip invalid dates

        // Only include games in the date range
        if (gameDate < startDate || gameDate > endDate) continue;

        // Determine if this is a home game
        const competition = event.competitions?.[0];
        if (!competition?.competitors) continue;

        const homeTeam = competition.competitors.find((c: any) => c?.homeAway === 'home');
        const awayTeam = competition.competitors.find((c: any) => c?.homeAway === 'away');

        const is49ersHome = homeTeam?.team?.abbreviation === 'SF';

        // Only include HOME games
        if (!is49ersHome) continue;

        const opponentName = awayTeam?.team?.displayName || 'TBD';

        let gameType = '';
        if (event.season?.type === 1) {
          gameType = ' (Preseason)';
        } else if (event.season?.type === 3) {
          gameType = ' (Playoffs)';
        }

        events.push({
          id: `nfl-49ers-${event.id}`,
          venueName: "Levi's Stadium",
          eventName: `49ers vs ${opponentName}${gameType}`,
          eventType: 'other',
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 3.5 * 60 * 60 * 1000).toISOString(),
          affectedStations: ['mountain-view', 'sunnyvale', 'santa-clara'],
          crowdLevel: 'high'
        });
      }
    }

    return createSuccessResponse(events, `Found ${events.length} 49ers games in date range`);
  } catch (error) {
    return handleApiError(error, 'get49ersGamesInRange');
  }
}
