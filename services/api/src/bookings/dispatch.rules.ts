// How an open session is offered to trainers. The nearest trainers hear first and the circle widens over time.
// ASSUMPTIONS (not yet decided with the founders, questions 10 and 11): the waiting times and the give-up time below.
// They live here and nowhere else, so changing them is a one-line change.
export type WaveScope = 'pincode' | 'cluster' | 'city';

export const DISPATCH_WAVES: readonly { wave: number; afterMinutes: number; scope: WaveScope }[] = [
  { wave: 1, afterMinutes: 0, scope: 'pincode' }, // trainers living in the same pincode as the session
  { wave: 2, afterMinutes: 10, scope: 'cluster' }, // trainers in any pincode of the same area cluster
  { wave: 3, afterMinutes: 25, scope: 'city' }, // every active trainer who teaches this service
];

// An instant session nobody has accepted this long after it was booked: tell the customer and offer another date or a cancel.
export const INSTANT_GIVE_UP_MINUTES = 60;

// A confirmed session still open this long after its start is flagged to ops, who close it or record a no-show.
export const COMPLETION_GRACE_MINUTES = 180;
