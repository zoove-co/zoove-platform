# Open questions for Pratik

These block the booking, pricing and matching tables (migration 0002). Everything else can proceed.

1. Trainer selection. The new designs show no trainer list; the trainer appears after booking.
   Is customer choice gone for good, or only hidden? (Old design: browse list, rebook, broadcast.)
2. Instant vs scheduled. The prototype has both "Book an Instant Session" and "Schedule a Session".
   For instant: target arrival time, and what happens when no trainer is free?
3. Pricing model. Designs: flat Rs 1,500 per session, demo Rs 500, packs of 6/12/24/36 sessions
   (Rs 9,000 / 17,000 / 30,000 / 40,000). Earlier deck: named SKUs (12-pack Rs 10,999, Duo 12, Family 20,
   Society, B2B cohort, Direct). Which is real? Is Rs 1,500 per session approved by the unit economics?
4. Package validity and rules: do unused sessions expire (4 / 8 / 16 / 24 weeks)? Refund of unused credits?
5. Booking for others. Prototype says Personal / Duo / Loved One / Group; the Figma wireframes say
   Couple. One name please. Does a Loved One booking need the other person's phone number?
6. Trainer payout: percentage or fixed amount per session, and per SKU?
7. Cancellation and reschedule policy (designs say reschedule up to 2 hours before). Fees? No-show rules?
   The app currently allows reschedule and cancel up to 2 hours before (placeholder, enforced in the mock API).
8. Health data. Onboarding collects age, gender, height, weight and medical issues. Who may see it
   (assigned trainer, admin, both)? Consent wording and retention?
9. Insurance and liability for at-home injuries. Gender-preference matching?
10. Referral rewards: what does the referrer and the friend get?
11. Prototype folder in Drive is shared as "anyone with the link": restrict to named people.
12-18. New questions from the v1 prototype: see section 6 of `prototype-v1-analysis.md`
    (final visual direction, coach continuity, Online/Studio formats, instant 4-hour promise,
    package expiry, streak rules, Pilates vs HIIT).
19. Demo offer (₹500): first booking only, once per customer, or unlimited? The mock allows it every time.
20. Operating hours: can "Instant, within 4 hrs" be booked at night? Earliest and latest slot? Minimum lead time for scheduled slots (the mock only requires the slot to be in the future).
21. Can a customer hold two instant bookings at once, and can they book two sessions in overlapping times for different services? The mock only blocks the exact same start time.
22. Address delete: allowed while a session at that address is upcoming? The mock blocks it.
23. Login: mobile number and OTP only, or also Google / Apple sign-in? (The app is OTP only today.) Is guest browsing before login wanted?
24. Profile: which details are required, and when? The app asks for first name only, later and optionally. Do age, gender, height, weight and medical notes come at signup, before the first booking, or never? (Ties to item 8.)
25. Terms of Service and Privacy Policy text, plus the cancellation policy text. The app links to placeholder screens.
26. SMS: sender name for the OTP message, and who registers it (DLT is needed for India). Which provider does Pratik prefer?
27. Areas we do not serve yet: collect a number or email to notify the customer when we open there (waitlist)? The app already tells them "we will let you know".
28. Final logo, brand colours and the splash animation. The app shows a text "zoove." wordmark and the designer's success.svg and Trophy.svg are broken: please ask for Lottie JSON files.
29. Trainer cancels: how long does the system search for a replacement, and what happens if nobody is found (offer a new time, automatic refund or credit, escalate to support)?
30. Trainer cancels: is the customer compensated (credit, discount)? What penalty does the trainer face, and how late is "too late" for a trainer to cancel?
31. If the preferred past coach is not free, is another coach assigned automatically, or does the customer approve first? (The app assigns automatically and notifies.)
32. Admin roles: who may change package prices and give discounts (Pratik, admin, support)? Do large discounts need approval? Per-customer discount codes, or only public package prices?
33. Notifications when a trainer cancels: push only, or also SMS or WhatsApp? Should support be alerted for sessions starting soon with no coach?

34. **No coach at all.** If no coach can take a scheduled booking at the chosen time (or a replacement is never found), what do we do: block the slot earlier, keep searching until a cutoff, or cancel with an apology and credit? The mock cancels the session if no coach is found by the start time.

Zoove Party (from the mockups, 14 Oct 2026)
35. Is Zoove Party in the first release, or after the 1:1 sessions launch? It needs payments, group sizing and an event-day experience.
36. Party types: Dance, Wellness, Aqua, Pilates. Is this the final list? Is Aqua (pool or water) realistic in Mumbai homes, and who provides the pool?
37. Pricing: per party, per guest, or by duration? The mockup shows a total near Rs 12,500 for 8 guests and 60 minutes, with durations of 60, 90 and 120 minutes. Are these real?
38. Guest limits: minimum, maximum, and how guest count changes price and the number of trainers.
39. Add-ons (music setup, healthy snacks, branded towels, photographer): are these ours or vendor-provided, and what are the prices? Who delivers them?
40. Trainer preference (any, female, male): does it apply to Party and to 1:1, and can it block a booking when no matching trainer is free?
41. Party cancellation and reschedule rules (deposit, refund window, trainer cancels close to the event). The 2-hour rule for 1:1 sessions will not fit a party.
42. "Kids and family" is listed as an occasion. Do we allow children as guests, and is any waiver, age rule or trainer check needed?
43. In-app "Message trainer" and "Chat with our team" appear in the mockup. Is in-app chat in scope, or do we mask calls and use WhatsApp?
44. **Swap format of a booked session.** The prototype Home banner says you can swap the format of a booked session (for example Vinyasa to Strength). Is it free, how late can it be done, and does it change the price or coach? Home banner only opens the booking flow for now.
45. **Demo session format.** The Flutter prototype labels the Rs 500 demo as "Online 1:1" while every other booking is "At-home 1:1". Is the demo online (video) or at home? Our app treats it as at-home today.
