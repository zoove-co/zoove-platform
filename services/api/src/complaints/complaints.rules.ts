// The rules of complaints, in one place so a change is a one-line change.
export type ComplaintSide = 'customer' | 'trainer';
export type ComplaintStatus = 'open' | 'waiting_on_user' | 'resolved';
export type ComplaintPriority = 'normal' | 'urgent';

export type CategoryInfo = { key: string; label: string; hint: string; urgent: boolean; needsSession: boolean };

// What each side can complain about. "urgent" ones are about safety or conduct: they go to the top of the team's list and alert them at once.
// "needsSession" ones are always about one session, so the app asks which.
export const CATEGORIES: Record<ComplaintSide, CategoryInfo[]> = {
  customer: [
    { key: 'trainer_late_or_no_show', label: 'Trainer late or did not come', hint: 'The trainer is late, cannot be reached or did not arrive.', urgent: false, needsSession: true },
    { key: 'trainer_behaviour', label: 'Trainer behaviour or safety', hint: 'You did not feel safe or respected.', urgent: true, needsSession: false },
    { key: 'session_quality', label: 'Quality of the session', hint: 'The session was not what you expected.', urgent: false, needsSession: true },
    { key: 'payment_or_package', label: 'Payment, refund or package', hint: 'A charge, a refund or your session credits.', urgent: false, needsSession: false },
    { key: 'app_problem', label: 'Problem with the app', hint: 'Something is not working.', urgent: false, needsSession: false },
    { key: 'other', label: 'Something else', hint: 'Anything that is not in the list.', urgent: false, needsSession: false },
  ],
  trainer: [
    { key: 'customer_unavailable', label: 'Customer not reachable or not at home', hint: 'You reached the address and could not meet the customer.', urgent: false, needsSession: true },
    { key: 'customer_behaviour', label: 'Customer behaviour or safety', hint: 'You did not feel safe or respected.', urgent: true, needsSession: false },
    { key: 'payout', label: 'Payout or earnings', hint: 'A missing or wrong payment.', urgent: false, needsSession: false },
    { key: 'app_or_job_problem', label: 'Problem with the app or a job', hint: 'Something is not working or a job looks wrong.', urgent: false, needsSession: false },
    { key: 'other', label: 'Something else', hint: 'Anything that is not in the list.', urgent: false, needsSession: false },
  ],
};

export const categoryOf = (side: ComplaintSide, key: string): CategoryInfo | undefined => CATEGORIES[side].find((c) => c.key === key);
export const labelOf = (key: string): string => [...CATEGORIES.customer, ...CATEGORIES.trainer].find((c) => c.key === key)?.label ?? 'Complaint';

export const MESSAGE_MAX = 2000;
// Stops a stuck app or a person from flooding the team: new complaints per day, messages per hour.
export const MAX_NEW_PER_DAY = 5;
export const MAX_MESSAGES_PER_HOUR = 30;
// A resolved complaint can be reopened by replying to it for this long. After that a new complaint is needed.
export const REOPEN_DAYS = 7;
// Complaints can be raised about a session this old, and the picker lists this many.
export const SESSION_LOOKBACK_DAYS = 60;
export const SESSION_PICKER_LIMIT = 15;

export const complaintCodeOf = (id: string): string => `ZC-${id.replace(/-/g, '').slice(-8).toUpperCase()}`;

// What a person is shown when the team writes. The team member's own name is not shown: the person talks to Zoove.
export const TEAM_NAME = 'Zoove support';
