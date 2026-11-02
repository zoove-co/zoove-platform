const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DayOption = { iso: string; weekday: string; dayOfMonth: number; month: string };

const pad = (n: number) => String(n).padStart(2, '0');

// Every session is in Mumbai, and the API works in India time, so the app does too: a customer travelling
// with a phone set to another time zone still sees and books Mumbai times. India has no daylight saving.
const IST_OFFSET_MS = 330 * 60_000;

// The wall-clock parts of an instant, in India. Read them with the UTC getters of the returned date.
const ist = (date: Date): Date => new Date(date.getTime() + IST_OFFSET_MS);

// Calendar date in India as YYYY-MM-DD.
export function toIsoDate(date: Date): string {
  const p = ist(date);
  return `${p.getUTCFullYear()}-${pad(p.getUTCMonth() + 1)}-${pad(p.getUTCDate())}`;
}

export function nextDays(count: number, from: Date = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, index) => {
    const day = ist(new Date(from.getTime() + index * 86_400_000));
    return {
      iso: toIsoDate(new Date(from.getTime() + index * 86_400_000)),
      weekday: WEEKDAYS[day.getUTCDay()] ?? '',
      dayOfMonth: day.getUTCDate(),
      month: MONTHS[day.getUTCMonth()] ?? '',
    };
  });
}

export function formatClock(date: Date): string {
  const p = ist(date);
  const hours = p.getUTCHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${pad(p.getUTCMinutes())} ${suffix}`;
}

// "5 min ago", "3 hrs ago", "2 days ago"
export function formatAgo(iso: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// "Tue, 14 Oct · 7:00 AM"
export function formatWhen(startsAt: string): string {
  const date = new Date(startsAt);
  const p = ist(date);
  return `${WEEKDAYS[p.getUTCDay()] ?? ''}, ${p.getUTCDate()} ${MONTHS[p.getUTCMonth()] ?? ''} · ${formatClock(date)}`;
}
