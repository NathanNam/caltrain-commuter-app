import { pacificDayWindow } from './pacific-time';

function tmTime(d: Date): string {
  // Ticketmaster wants YYYY-MM-DDTHH:mm:ssZ (no milliseconds)
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A Pacific calendar day (YYYY-MM-DD) as Ticketmaster's UTC start/end parameters. */
export function ticketmasterWindow(date: string): { start: string; end: string } {
  const [y, m, d] = date.split('-').map(Number);
  const { start, end } = pacificDayWindow(y, m, d);
  return { start: tmTime(start), end: tmTime(new Date(end.getTime() - 1000)) };
}
