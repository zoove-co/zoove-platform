import { IST_OFFSET_MINUTES } from '../bookings/rules';

// ASSUMPTION (question 46): the weekly goal shown on Home and Streak. Copied from the app's placeholder.
export const WEEKLY_GOAL = 3;

// ASSUMPTION (not yet asked): the "within N hours" promise shown for instant bookings. Copied from the app's placeholder.
export const INSTANT_ETA_HOURS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
const shift = (date: Date) => new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);

// Calendar day in India, as YYYY-MM-DD.
export const istIsoDate = (date: Date): string => shift(date).toISOString().slice(0, 10);

// Start (00:00 India time) of the Monday of the week that contains `date`.
export function istWeekStart(date: Date): Date {
  const shifted = shift(date);
  const sinceMonday = (shifted.getUTCDay() + 6) % 7;
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MINUTES * 60_000 - sinceMonday * DAY_MS);
}

export const WEEK_MS = 7 * DAY_MS;
export { DAY_MS };
