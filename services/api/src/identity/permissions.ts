// What an admin can be allowed to do. An owner has all of them. Everyone else has only the ones switched on for them.
// 'soon' ones are stored now but do nothing until those screens exist.
export const PERMISSION_KEYS = [
  'trainers.view',
  'trainers.documents',
  'trainers.decide',
  'trainers.status',
  'customers.view',
  'complaints.customers',
  'complaints.trainers',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

export type PermissionInfo = { key: Permission; group: string; label: string; hint: string; soon: boolean };

export const PERMISSIONS: PermissionInfo[] = [
  { key: 'trainers.view', group: 'Trainers', label: 'View trainer applications', hint: 'See the list and each application, without documents.', soon: false },
  { key: 'trainers.documents', group: 'Trainers', label: 'View KYC documents', hint: 'Open Aadhaar, PAN and selfie. Every view is recorded.', soon: false },
  { key: 'trainers.decide', group: 'Trainers', label: 'Approve, reject or ask for changes', hint: 'Decide on trainer applications.', soon: false },
  { key: 'trainers.status', group: 'Trainers', label: 'Pause, suspend, revoke or resume trainers', hint: 'Change the status of an approved trainer. A reason is recorded.', soon: false },
  { key: 'customers.view', group: 'Customers', label: 'View customers', hint: 'See customer profiles and bookings.', soon: true },
  { key: 'complaints.customers', group: 'Complaints', label: 'Handle customer complaints', hint: 'Review and resolve customer complaints.', soon: true },
  { key: 'complaints.trainers', group: 'Complaints', label: 'Handle trainer complaints', hint: 'Review and resolve trainer complaints.', soon: true },
];

// Doing something with trainers needs seeing them first, so the switches that act on trainers also turn on "view".
export function normalisePermissions(input: readonly string[]): Permission[] {
  const wanted = new Set(input.filter((key): key is Permission => (PERMISSION_KEYS as readonly string[]).includes(key)));
  if (wanted.has('trainers.documents') || wanted.has('trainers.decide') || wanted.has('trainers.status')) wanted.add('trainers.view');
  return PERMISSION_KEYS.filter((key) => wanted.has(key));
}
