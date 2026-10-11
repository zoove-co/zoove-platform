# Prototype v1 analysis (Pratik's SwiftUI prototype, 6 Oct 2026)

Source: `D:\Projects\zoove\Zoove Prototype v1-...\ZooveApp.swift` (single file, ~3,000 lines, local mock state, no backend).
README calls it "Option 3: Expressive Canvas". It is a design and flow reference, not code to reuse.

## 1. Design direction (conflicts with the Figma wireframes)
- Prototype: white UI, purple #4B18F8 primary, magenta #C900D8 accent, lavender #E8D9FF surfaces, ink #080B0F,
  monochrome (desaturated) photography, handwritten-style ZOOVE wordmark, 4-blade logo mark,
  tagline "Consistency. On your terms."
- Our Figma wireframes: cream background, teal/coral, Fraunces serif.
- "Option 3" implies Pratik is still choosing. Build the app theme from one tokens file so a swap is cheap.

## 2. Screen inventory (customer app)
Splash. Sign in (prototype is a fake "Continue as Pratik"; real app = phone OTP).
Tabs: Home, Your Streak, Account.

Home: greeting, bell (notifications, unread dot), avatar to profile, location pill to addresses;
Instant Session (within 4 hrs, Rs 1,500), Schedule a Session (Rs 1,500), Explore Consistency Packages;
Explore grid (Yoga, Strength, Pilates, Zumba); demo banner (Rs 500, was Rs 1,500, 1-on-1);
Zoove Academy (3 info cards); upcoming-session dock ("2/3 this week") opening a bottom sheet.

Activity detail: hero photo, 3 styles per activity, tagline, description, duration, intensity, demo link,
Instant and Schedule buttons.

Booking flow (one cumulative scroll): 1 Book for (Personal / Duo / Loved One / Group); 2 activity + style;
3 date (7 days) + slot (6-9 AM, 4-7 PM) + address (edit, add, saved list); 4 review
(style, participant, price or "1 session from package", date/time, coach, format, address, total) and confirm.

Packages: pick participant, 6 / 12 / 24 / 36 sessions (Rs 9,000 / 17,000 / 30,000 / 40,000; per session
1,500 / 1,417 / 1,250 / 1,111; valid 4 / 8 / 16 / 24 weeks), review, add, then "Book your first session".

Upcoming session sheet and Session details: card (confirmed, coach, time, format, address), Reschedule,
Swap format, remaining sessions, weeks left, sessions this week, "Last PT focus" (coach notes with tags),
quick access (session details, trainer profile, package details), add to calendar, contact your coach,
cancellation policy.

Your Streak: week streak with next milestone (5 weeks), this/last week day marks, metrics, focus areas,
last-week focus, package progress, recent sessions, progress profile (goal, days per week), book next session.

Account: referral banner (code, share), profile (name, email, phone; fitness goal, days/week, age, height,
weight, health notes), Orders & History, Addresses (primary + saved: add, edit, delete, use),
Manage Bookings, Performance & Progress, Policies (booking; rescheduling and cancellation; privacy; terms),
Help & Support (FAQ + contact), Switch Account (second local profile for a loved one), Logout.
Also: Notifications, Referrals, Goals editor, Reschedule (time options), Swap format.

## 3. New requirements this adds to our plan
1. The coach is shown before confirming ("Available times with Akash Singh", "Where should Akash meet you?",
   review row "Coach"). No trainer list, but the customer sees a pre-assigned coach, and slots come from
   that coach's availability. Looks like "your coach" continuity ("Contact your coach", "Akash's last-session focus").
2. Delivery formats: At-home 1:1, Online 1:1 (the demo is online), Studio. "Swap format" changes it after booking.
   Online implies video calls. Big scope item.
3. Services: Yoga, Strength, Pilates, Zumba (HIIT dropped). Three styles each. Participants: Personal, Duo,
   Loved One, Group ("Duo", not "Couple").
4. Instant session promises a coach within 4 hours.
5. Packages expire (validity in weeks) and show "weeks left".
6. Post-session coach notes: a focus title and tags (e.g. Core strength, Flexibility, Posture). The trainer app must capture these.
7. Weekly streak: consecutive weeks hitting the weekly goal (days per week set in the progress profile). Mock numbers are inconsistent (2/3, 5/8, 0/3).
8. Referral code with a share sheet; rewards not defined.
9. Notifications list, add to calendar, and a second profile for a loved one.
10. Health data is collected as free text (age, height, weight, "health notes").

## 4. Missing from the prototype (must be designed)
Real OTP login; address search and serviceability check (cluster locked = waitlist screen); payment and failure;
instant-booking "no coach available" state; start code and end code; trainer on the way; rating and review;
cancellation flow and fees; invoices; empty, loading and error states; consent screens; support tickets.

## 5. Proposed customer MVP cut
In: splash, OTP login, profile basics, address + serviceability, catalog (Yoga, Strength, Pilates, Zumba),
schedule booking (Personal), instant booking, payment, upcoming session (reschedule, cancel), orders and history,
account, notifications, packages and credits, weekly streak, referral code.
Later: Online and Studio formats, Duo / Loved One / Group, second profiles, coach chat, Academy content, rewards.

## 6. Questions (continue numbering from open-questions.md)
12. Which look is final: purple Expressive Canvas or the teal cream direction?
13. Is a customer tied to one "coach" over time, or assigned per booking? What if the coach is unavailable?
14. Are Online and Studio formats in the first release?
15. What does "Instant, within 4 hrs" promise, and what happens if no coach accepts?
16. Do packages expire (4 / 8 / 16 / 24 weeks)? Refund or extension rules?
17. How is a streak counted (weeks meeting the weekly goal) and what are the milestone rewards?
18. Is Pilates replacing HIIT, or both?
