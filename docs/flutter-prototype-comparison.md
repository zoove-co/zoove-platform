# Pratik's Flutter prototype vs our customer app

Source: `Zoove Prototype Versions/ZooveFlutterProject` (about 6,000 lines of Dart, built by Pratik with AI help).
It is a port of his SwiftUI v12. Everything is in-memory, sign-in accepts any number and OTP, checkout takes no payment.
Treat it as a screen and copy reference, not as requirements. Rules it implies are listed as open questions.

## 1. Matches (nothing to do)
- Prices: instant Rs 1,899, scheduled Rs 1,500, demo Rs 500, packages 6/12/24/36 at Rs 9,000 / 17,000 / 30,000 / 40,000.
- Booking: who it is for, activity and style, date and time, address, review, confirmation.
- Style and format lists, party planner (4 steps, guests 2 to 30), upcoming-session dock, reschedule, notifications.
- Colours and brand: same palette; images are the same files.
- Reschedule up to 2 hours before the session (open question 7, not a confirmed rule).

## 2. Fixed after this comparison
- Packages: "Most popular" belongs on the 6-session pack and validity is 4 / 8 / 16 / 24 weeks. Our mock had it on 12 sessions with no validity.

## 3. Gaps: in the prototype, not in our app
Business-affecting (need Pratik's answer first):
- Coach is assigned before the time is picked ("Available times with Akash Singh"). We match after booking. Open question 1.
- Demo session is "Online 1:1"; every other booking is "At-home 1:1". We treat demo as at-home. New open question 45.
- Party locations Studio and Online are selectable. We show them as "Soon". Open questions 35 to 43.
- Referral (code, copy, "Refer a friend"). Rewards unknown, open question 10.
- Second profile for a loved one ("Switch Profile"). Open question 5 (booking for others).

UI/feature gaps (safe to build, UI only):
- Your Streak is much richer in the prototype: week calendar (booked / today), milestones, focus areas, "last week focus" from the coach, package balance, recent sessions, progress profile. Ours shows a single weekly goal card.
- Account: Manage Bookings, Performance and Progress, Switch Profile, Help and Support (FAQ), Policies list. We have placeholders for policy and support.
- Goals / progress profile: fitness goal, days per week, height, weight, medical notes. Medical notes are sensitive, open question 8.
- Package screen: "Book Zoove for" row (You, Duo, Loved One, Group) and the benefit strip (Flexible, Mix Formats, At-Home, Certified).
- Academy detail screen ("Move well, feel good").
- Splash screen with tagline "Consistency. On your terms."
- Wording: his party step titles ("Make it an occasion", "Choose your party Zoove", "Set the party details").

## 4. Where we go further than the prototype
Real API shape (idempotency, errors, polling), rematching when a trainer cancels, past-coach rebooking,
serviceability check, admin-driven packages, notifications from events, tracking plan, typed routes, tests via lint and typecheck.

## 5. What it does not show (still unknown)
Payments and refunds, trainer app, trainer payout, cancellation fees, no-show rules, insurance, ops tooling, real availability.
