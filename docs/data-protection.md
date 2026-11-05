# Data protection and incident response

Applies to: India's Digital Personal Data Protection Act 2023 (DPDP). Zoove is the data fiduciary: we answer for the data even when a vendor holds it.
This is an engineering runbook, not legal advice. Have the CA or a lawyer review it, the policy texts and the vendor contracts before launch.

## Rules the code follows
1. **Collect little.** Name, phone or email, address, optional height and weight (own consent, deletable). No card numbers: payments will go through the gateway.
2. **Never log or send personal data.** No names, emails, phones, addresses or sign-in codes in log lines, error messages or analytics properties. Sentry has request bodies, headers, cookies and query strings switched off, and a scrubber removes emails, phones and tokens from error text (`services/api/src/monitoring/scrub.ts`).
3. **Production guards.** The console SMS and email providers (which print codes and mail) refuse to start in production (`config/env.ts`).
4. **Private files only.** KYC documents are in a private bucket, read by short-lived signed links. PAN is encrypted with `PII_SECRET`.
5. **Only the API reaches the database.** Row-level security is on for every table with no public policies, so the Supabase public keys read nothing.
6. **Delete on a schedule.** `RetentionService` removes old sign-in codes (1 day), expired sessions (30 days after expiry), discount-attempt records (90 days) and clears consent IP addresses (after 1 year, or on account deletion). Windows are in `maintenance/retention.service.ts`.
7. **Account deletion** (customer app) wipes name, phone, email, addresses, health details, notifications, and the other person's details on loved-one bookings. Booking and payment rows stay without personal details, for accounts and disputes.
8. **Consent is recorded** with the document version. Changing a policy text means bumping `TERMS_VERSION`.

## Habits for every change
- New field that holds personal data: say why it is needed, add it to deletion and to the Privacy Policy.
- New vendor: add it to the Privacy Policy "Service providers" list and sign its data-processing agreement.
- New log line or error: read it once and ask "could this contain a name, phone, email or address?"
- Staff access: people see customer details only through the admin panel, which is permission-checked and audit-logged. No customer data in chat, email or spreadsheets.

## If a breach is suspected
1. **Contain (first hour).** Rotate the exposed secret: Supabase service and database passwords, `JWT_SECRET` (signs everyone out), `OTP_SECRET`, `PII_SECRET` (re-encrypt PAN first), Resend, MSG91, S3 keys. Revoke the access that was used.
2. **Record.** Write down when it was found, what data, how many people, how it happened. Keep logs. Do not delete evidence.
3. **Assess.** Which customers or trainers are affected, and what was exposed (contact details, addresses, health details, KYC).
4. **Notify.** Under DPDP the Data Protection Board and every affected person must be told, in the form and time the rules set. Ask the lawyer for the exact deadline the same day. Tell customers plainly what happened, what we did, and what they should do.
5. **Fix and learn.** Fix the cause, add a test, update this file.
Contact owner: Ritesh (CTO). Notify Pratik immediately.

## Open items (need a decision or an adviser)
- A named grievance contact, as the law expects (currently the shared admin@zoove.co inbox).
- Legal review of Terms, Privacy and Cancellation texts; legal entity name and registered address.
- Whether a data-processing agreement is signed with Supabase, Render, Resend, MSG91 and Sentry.
- Supabase backups: confirm the backup plan and that restored backups re-apply deletions.
- Staff PII access: audit-log every view of a customer's phone and address, not only changes.
- Written consent route for anyone under 18 (today the Terms say 18 or older, and nothing checks it).
