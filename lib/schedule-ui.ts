// Small client-side helpers shared by the schedule views.
import { TrainType } from './types';
import { addDays, isoDate } from './pacific-time';
import { currentServiceDate, WEEKDAY_NAMES } from './service-day';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Flat type tags in the charter colours (L / LTD / EXP / SC). */
export const TYPE_TAG: Record<TrainType, { tag: string; cls: string }> = {
  Local: { tag: 'L', cls: 'local' },
  Limited: { tag: 'LTD', cls: 'limited' },
  Express: { tag: 'EXP', cls: 'express' },
  'South County': { tag: 'SC', cls: 'south-county' },
};

/** "Sat 31 Oct" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAY_NAMES[wd].slice(0, 3)} ${d} ${MONTHS[m - 1]}`;
}

/** Service dates from today: [today, tomorrow, +2 … +7]. */
export function upcomingServiceDates(now: number): string[] {
  const t = currentServiceDate(new Date(now));
  return Array.from({ length: 8 }, (_, i) => {
    const d = addDays(t.year, t.month, t.day, i);
    return isoDate(d.year, d.month, d.day);
  });
}

// Caltrain's own schedules page (linked from caltrain.com's navigation).
export const CALTRAIN_TIMETABLE_URL = 'https://www.caltrain.com/schedules/pdfs';
