// MLB Schedule Fetcher
// Fetches SF Giants games from MLB Stats API (free, no key required)
// Source: https://statsapi.mlb.com/api/v1/schedule
// Documentation: https://github.com/toddrob99/MLB-StatsAPI

import { VenueEvent } from './types';

const SF_GIANTS_TEAM_ID = 137;

/**
 * Fetch Giants games for a specific date
 * Uses MLB's free Stats API - no API key required
 */
export async function getGiantsGamesForDate(date: Date): Promise<VenueEvent[]> {
  try {
    // Convert to Pacific Time date for querying (games are scheduled in Pacific Time)
    const pacificDateStr = date.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split(',')[0]; // MM/DD/YYYY
    const [month, day, year] = pacificDateStr.split('/');
    const dateStr = `${year}-${month}-${day}`; // YYYY-MM-DD

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${SF_GIANTS_TEAM_ID}&startDate=${dateStr}&endDate=${dateStr}`,
      { next: { revalidate: 1800 } } // Cache for 30 minutes
    );

    if (!response.ok) {
      console.error('MLB Stats API error:', response.status);
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    // Parse games from the dates array
    if (data.dates && Array.isArray(data.dates)) {
      for (const dateEntry of data.dates) {
        if (!dateEntry.games || !Array.isArray(dateEntry.games)) continue;

        for (const game of dateEntry.games) {
          // Determine if this is a home game (at Oracle Park)
          const homeTeam = game.teams?.home;
          const awayTeam = game.teams?.away;

          if (!homeTeam || !awayTeam) continue;

          const isGiantsHome = homeTeam.team?.id === SF_GIANTS_TEAM_ID;

          // Only include HOME games at Oracle Park
          if (!isGiantsHome) continue;

          // Get opponent name
          const opponentName = awayTeam.team?.name || 'TBD';

          // Determine game type
          let gameType = '';
          if (game.gameType === 'S') {
            gameType = ' (Spring Training)';
          } else if (game.gameType === 'E') {
            gameType = ' (Exhibition)';
          } else if (game.gameType === 'F' || game.gameType === 'D' || game.gameType === 'L' || game.gameType === 'W') {
            gameType = ' (Playoffs)';
          }

          // Get game time
          const gameDate = new Date(game.gameDate);

          // Create event
          events.push({
            id: `mlb-giants-${game.gamePk}`,
            venueName: 'Oracle Park',
            eventName: `Giants vs ${opponentName}${gameType}`,
            eventType: 'baseball',
            startTime: gameDate.toISOString(),
            endTime: new Date(gameDate.getTime() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours duration
            affectedStations: ['sf', '22nd', 'bayshore'],
            crowdLevel: 'high'
          });
        }
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Giants schedule:', error);
    return [];
  }
}

/**
 * Get all Giants games in a date range
 */
export async function getGiantsGamesInRange(startDate: Date, endDate: Date): Promise<VenueEvent[]> {
  try {
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const response = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${SF_GIANTS_TEAM_ID}&startDate=${startDateStr}&endDate=${endDateStr}`,
      { next: { revalidate: 1800 } }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const events: VenueEvent[] = [];

    if (data.dates && Array.isArray(data.dates)) {
      for (const dateEntry of data.dates) {
        if (!dateEntry.games || !Array.isArray(dateEntry.games)) continue;

        for (const game of dateEntry.games) {
          const homeTeam = game.teams?.home;
          const awayTeam = game.teams?.away;

          if (!homeTeam || !awayTeam) continue;

          const isGiantsHome = homeTeam.team?.id === SF_GIANTS_TEAM_ID;

          // Only include HOME games
          if (!isGiantsHome) continue;

          const opponentName = awayTeam.team?.name || 'TBD';

          let gameType = '';
          if (game.gameType === 'S') {
            gameType = ' (Spring Training)';
          } else if (game.gameType === 'E') {
            gameType = ' (Exhibition)';
          } else if (game.gameType === 'F' || game.gameType === 'D' || game.gameType === 'L' || game.gameType === 'W') {
            gameType = ' (Playoffs)';
          }

          const gameDate = new Date(game.gameDate);

          events.push({
            id: `mlb-giants-${game.gamePk}`,
            venueName: 'Oracle Park',
            eventName: `Giants vs ${opponentName}${gameType}`,
            eventType: 'baseball',
            startTime: gameDate.toISOString(),
            endTime: new Date(gameDate.getTime() + 3 * 60 * 60 * 1000).toISOString(),
            affectedStations: ['sf', '22nd', 'bayshore'],
            crowdLevel: 'high'
          });
        }
      }
    }

    return events;
  } catch (error) {
    console.error('Error fetching Giants schedule range:', error);
    return [];
  }
}
