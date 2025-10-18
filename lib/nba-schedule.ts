// NBA Schedule Fetcher
// Fetches Golden State Warriors games from ESPN NBA API (free, no key required)
// Source: https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/gsw/schedule

import { VenueEvent } from './types';

export interface NBAGame {
  id: string;
  date: string;
  name: string;
  isHome: boolean;
  opponent: string;
  venue: string;
}

/**
 * Fetch Warriors games for a specific date
 * Uses ESPN's free NBA API - no API key required
 */
export async function getWarriorsGamesForDate(date: Date): Promise<VenueEvent[]> {
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/gsw/schedule',
      { next: { revalidate: 1800 } } // Cache for 30 minutes
    );

    if (!response.ok) {
      console.error('ESPN NBA API error:', response.status);
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    // Get the target date string (YYYY-MM-DD) in Pacific Time
    // Games are compared by their Pacific Time date, not UTC date
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

        // Determine if this is a home game (Warriors are at Chase Center)
        const competition = event.competitions?.[0];
        if (!competition) continue;

        // Check if Warriors are the home team
        const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');

        const isWarriorsHome = homeTeam?.team?.abbreviation === 'GS' || homeTeam?.team?.abbreviation === 'GSW';

        // Only include HOME games at Chase Center
        if (!isWarriorsHome) continue;

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
          id: `nba-warriors-${event.id}`,
          venueName: 'Chase Center',
          eventName: `Warriors vs ${opponentName}${gameType}`,
          eventType: 'basketball',
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 2.5 * 60 * 60 * 1000).toISOString(), // 2.5 hours duration
          affectedStations: ['sf', '22nd'],
          crowdLevel: 'high'
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Warriors schedule:', error);
    return [];
  }
}

/**
 * Get all Warriors games in a date range
 */
export async function getWarriorsGamesInRange(startDate: Date, endDate: Date): Promise<VenueEvent[]> {
  // ESPN API returns full season schedule, so we just need to fetch once and filter
  try {
    const response = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/gsw/schedule',
      { next: { revalidate: 1800 } }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    if (data.events && Array.isArray(data.events)) {
      for (const event of data.events) {
        const gameDate = new Date(event.date);

        // Only include games in the date range
        if (gameDate < startDate || gameDate > endDate) continue;

        // Determine if this is a home game
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
        const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');

        const isWarriorsHome = homeTeam?.team?.abbreviation === 'GS' || homeTeam?.team?.abbreviation === 'GSW';

        // Only include HOME games
        if (!isWarriorsHome) continue;

        const opponentName = awayTeam?.team?.displayName || 'TBD';

        let gameType = '';
        if (event.season?.type === 1) {
          gameType = ' (Preseason)';
        } else if (event.season?.type === 3) {
          gameType = ' (Playoffs)';
        }

        events.push({
          id: `nba-warriors-${event.id}`,
          venueName: 'Chase Center',
          eventName: `Warriors vs ${opponentName}${gameType}`,
          eventType: 'basketball',
          startTime: gameDate.toISOString(),
          endTime: new Date(gameDate.getTime() + 2.5 * 60 * 60 * 1000).toISOString(),
          affectedStations: ['sf', '22nd'],
          crowdLevel: 'high'
        });
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Warriors schedule range:', error);
    return [];
  }
}
