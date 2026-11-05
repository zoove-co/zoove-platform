// Last line of defence: even if a developer puts a customer's email or phone into an error message by mistake,
// it is removed before the report leaves our servers. (The app has the same function in apps/customer-app/src/lib/monitoring.ts.)
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const TOKEN = /\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

export function scrubText(value: string): string {
  return value.replace(TOKEN, '[token]').replace(EMAIL, '[email]').replace(PHONE, '[phone]');
}

type Scrubbable = {
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string }[];
};

export function scrubEvent<T extends Scrubbable>(event: T): T {
  if (event.message) event.message = scrubText(event.message);
  for (const v of event.exception?.values ?? []) if (v.value) v.value = scrubText(v.value);
  for (const b of event.breadcrumbs ?? []) if (b.message) b.message = scrubText(b.message);
  return event;
}
