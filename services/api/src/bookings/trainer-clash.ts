// True when a trainer already holds another confirmed session that overlaps the time window [start, start + minutes).
// A session lasts as long as its service's longest duration (the same length the app uses to say "in progress"), so a
// trainer cannot hold a 6:00 session and a 6:30 session. No travel buffer is assumed: that is a business decision.
// Arguments are SQL expressions (for example `$1` or `b.starts_at`): trainer is a uuid, start a timestamptz, minutes an int.
export function trainerBusySql(trainer: string, start: string, minutes: string, ignoreBookingId?: string): string {
  const ignore = ignoreBookingId ? `and x.id <> ${ignoreBookingId}` : '';
  return `exists (select 1 from bookings x join services xs on xs.id = x.service_id
                   where x.coach_id = ${trainer} and x.status = 'confirmed' and x.starts_at is not null ${ignore}
                     and x.starts_at < (${start})::timestamptz + make_interval(mins => (${minutes})::int)
                     and x.starts_at + make_interval(mins => xs.duration_max_minutes) > (${start})::timestamptz)`;
}
