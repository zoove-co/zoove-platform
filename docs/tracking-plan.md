# Tracking plan (draft)

One list of events, owned by product and engineering together. Pratik (CleverTap) reviews names
and properties before they ship, because CleverTap journeys depend on them.

Rules
- snake_case, `object_action`, past tense for completed actions.
- Properties use ids and slugs, never display text. Money in paise.
- Never put health data or full phone numbers in event properties.
- Every event carries: user_id (if logged in), anonymous_id, source, occurred_at (UTC), app_version.
- All events go through `track()`, which writes our own `event_log` and fans out to Firebase and CleverTap.

| Event | When | Key properties |
|---|---|---|
| app_opened | App foregrounded | is_first_open |
| otp_requested | OTP sent | channel |
| otp_verified | Login succeeded | is_new_user |
| service_viewed | Service detail opened | service_slug |
| service_selected | Service chosen | service_slug, format_slug, booking_for |
| slot_selected | Date and time picked | service_slug, starts_at, mode (instant or scheduled) |
| address_confirmed | Address confirmed | cluster_slug |
| booking_started | Booking flow entered | service_slug |
| booking_abandoned | Flow left before confirm | last_step |
| booking_confirmed | Booking created | booking_id, service_slug, amount_paise |
| payment_failed | Payment error | reason_code |
| session_completed | End code accepted | booking_id |
| booking_rescheduled | Time changed | booking_id |
| booking_cancelled | Booking cancelled | booking_id, reason |

Retention triggers planned in CleverTap: started but not confirmed within 30 minutes; no booking within
10 to 11 days of the last completed session; streak about to break.
