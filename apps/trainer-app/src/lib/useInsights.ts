import { useQuery } from '@tanstack/react-query';

import { getInsights } from '@/lib/api';

/** My earnings and analytics. They change only when a session is finished, so a check every 30 seconds is plenty. */
export function useInsights() {
  return useQuery({ queryKey: ['insights'], queryFn: getInsights, refetchInterval: 30_000, staleTime: 15_000 });
}

/** 1234567 paise -> "₹12,345" (Indian grouping, no decimals unless there are paise). */
export function rupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const digits = String(whole);
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${sign}₹${grouped}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** Short form for chart labels: 120000 paise -> "₹1.2k". */
export function rupeesShort(paise: number): string {
  const r = paise / 100;
  if (r >= 100000) return `₹${(r / 100000).toFixed(r % 100000 === 0 ? 0 : 1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
}
