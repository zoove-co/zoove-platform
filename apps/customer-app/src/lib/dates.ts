const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type DayOption = { iso: string; weekday: string; dayOfMonth: number; month: string };

const pad = (n: number) => String(n).padStart(2, '0');

// Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the customer's clock).
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nextDays(count: number, from: Date = new Date()): DayOption[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + index);
    return {
      iso: toIsoDate(day),
      weekday: WEEKDAYS[day.getDay()] ?? '',
      dayOfMonth: day.getDate(),
      month: MONTHS[day.getMonth()] ?? '',
    };
  });
}

export function formatClock(date: Date): string {
  const hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${pad(date.getMinutes())} ${suffix}`;
}

// "Tue, 14 Oct · 7:00 AM"
export function formatWhen(startsAt: string): string {
  const date = new Date(startsAt);
  return `${WEEKDAYS[date.getDay()] ?? ''}, ${date.getDate()} ${MONTHS[date.getMonth()] ?? ''} · ${formatClock(date)}`;
}
