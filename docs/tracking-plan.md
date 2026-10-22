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
| packages_viewed | Packages entry tapped on Home | none |
| academy_viewed | Academy card tapped | section (certified, programs, verified) |
| notifications_opened | Bell tapped | none |
| orders_viewed | Orders & History opened | none |
| past_coach_selected | Customer asked for a past coach in the booking flow (or switched back to any coach) | coach_id (null = any coach) |
| package_selected | Choose tapped on a package | package_id, sessions_count, price_paise |
| booking_repeated | Book again tapped on a past session | booking_id, service_slug |
| streak_viewed | Streak tab opened | none |
| account_viewed | Account tab opened | none |
| profile_completed | Customer saved their name and details in Edit profile | none |
| signed_out | Customer signed out from Account | none |

Retention triggers planned in CleverTap: started but not confirmed within 30 minutes; no booking within
10 to 11 days of the last completed session; streak about to break.
| `banner_tapped` | Customer taps a Home banner | `banner` |
| `party_viewed` | Customer opens the Zoove Party planner | none |
| `party_plan_saved` | Customer finishes the party planner | `occasion`, `activity`, `guests` |
| `help_viewed` | Help & support opened | none |
| `referral_viewed` | Refer a friend opened | none |
| `referral_shared` | Customer taps Share on the referral screen | none |
