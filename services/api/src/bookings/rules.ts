// Booking rules. Every number here is an ASSUMPTION copied from the app's placeholders; each one
// points at the open question that will settle it (docs/open-questions.md). Change them here only.

export const IST_OFFSET_MINUTES = 330; // India has no daylight saving, so a fixed offset is exact.

// ASSUMPTION (question 20: operating hours): the same eight start times the app shows today.
export const SLOT_TIMES = ['06:00', '07:00', '08:00', '09:00', '16:00', '17:00', '18:00', '19:00'] as const;

// ASSUMPTION (question 7): a session can be moved or cancelled up to 2 hours before it starts.
export const CHANGE_WINDOW_MS = 2 * 60 * 60 * 1000;

// ASSUMPTION (not yet asked): how far ahead a session can be booked.
export const BOOKING_HORIZON_DAYS = 60;

const pad = (value: number) => String(value).padStart(2, '0');

// A calendar day in India as a real range of instants.
export function dayRange(isoDate: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const start = new Date(`${isoDate}T00:00:00+05:30`);
  if (Number.isNaN(start.getTime())) return null;
  // Rejects dates like 2026-02-31 that JavaScript would roll over.
  const back = new Date(start.getTime() + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
  if (back !== isoDate) return null;
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function slotStarts(isoDate: string): { time: string; startsAt: Date }[] {
  return SLOT_TIMES.map((time) => ({ time, startsAt: new Date(`${isoDate}T${time}:00+05:30`) }));
}

function istParts(date: Date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    ms: shifted.getUTCMilliseconds(),
  };
}

export function isSlotStart(date: Date): boolean {
  const p = istParts(date);
  if (p.second !== 0 || p.ms !== 0) return false;
  return (SLOT_TIMES as readonly string[]).includes(`${pad(p.hour)}:${pad(p.minute)}`);
}

export function withinHorizon(date: Date, now: Date): boolean {
  return date.getTime() <= now.getTime() + BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatClock(date: Date): string {
  const p = istParts(date);
  const hour12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${hour12}:${pad(p.minute)} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

export function formatWhen(date: Date): string {
  const p = istParts(date);
  return `${WEEKDAYS[p.weekday]}, ${p.day} ${MONTHS[p.month]} · ${formatClock(date)}`;
}
