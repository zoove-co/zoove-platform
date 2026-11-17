import { create } from 'zustand';

import { API_URL } from '@/lib/config';

// Tracks whether Zoove can be reached at all. One failed request is not an outage (a lift, a tunnel, a slow moment);
// two in a row that never got an answer, or got "service unavailable" from the host, are. Any good answer clears it.
const TRIP_AFTER = 2;
const CHECK_TIMEOUT_MS = 8_000;

type State = { down: boolean; checking: boolean };
export const useOutage = create<State>(() => ({ down: false, checking: false }));

let streak = 0;

/** Called by the API client after every request with the HTTP status (0 when there was no answer). */
export function noteReply(status: number): void {
  // 502/503/504 is what the host answers while the API is down or starting. A plain 500 is a bug in one endpoint, not an outage.
  const unreachable = status === 0 || status === 502 || status === 503 || status === 504;
  if (!unreachable) {
    streak = 0;
    if (useOutage.getState().down) useOutage.setState({ down: false });
    return;
  }
  streak += 1;
  if (streak >= TRIP_AFTER && !useOutage.getState().down) useOutage.setState({ down: true });
}

/** Asks the API whether it is up (and its database). Clears the outage when it is. */
export async function recheck(): Promise<boolean> {
  if (useOutage.getState().checking) return false;
  useOutage.setState({ checking: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  let ok = false;
  try {
    const response = await fetch(`${API_URL}/health/ready`, { signal: controller.signal });
    ok = response.ok;
  } catch {
    ok = false;
  } finally {
    clearTimeout(timer);
  }
  if (ok) {
    streak = 0;
    useOutage.setState({ down: false, checking: false });
  } else {
    useOutage.setState({ checking: false });
  }
  return ok;
}
