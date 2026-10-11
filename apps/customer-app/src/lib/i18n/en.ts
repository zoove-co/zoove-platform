// All user-visible text lives here (decision D7), so Hindi and Marathi can be added later
// without touching screens.
export const en = {
  tabs: {
    home: 'Home',
    streak: 'Your Streak',
    account: 'Account',
  },
  home: {
    greeting: 'Hi {{name}}',
    bookTitle: 'Book a Session',
    instantTitle: 'Instant Session',
    instantDetail: 'Within {{hours}} hrs',
    scheduleTitle: 'Schedule a Session',
    scheduleDetail: 'Choose a date & slot',
    packagesTitle: 'Explore Consistency Packages',
    packagesDetail: 'Build a routine that works for you',
    exploreTitle: 'Explore',
    demoEyebrow: 'NEW TO ZOOVE?',
    demoTitle: 'Book a demo session',
    demoFormat: '(1-on-1)',
    academyTitle: 'ZOOVE ACADEMY',
    academySubtitle:
      'Every trainer is certified, trained through dedicated programs, and trusted & verified.',
    academyCertified: 'Certified\nTrainers',
    academyPrograms: 'Training\nPrograms',
    academyVerified: 'Trusted\n& Verified',
    upcomingEyebrow: 'UPCOMING SESSION  ·  {{done}}/{{goal}} THIS WEEK',
    errorTitle: 'We could not load your home screen',
    retry: 'Try again',
  },
  soon: {
    title: 'Coming soon',
    body: 'This screen is still being built.',
    back: 'Go back',
  },
  placeholders: {
    streak: 'Your weekly streak and progress will appear here.',
    account: 'Your profile, orders and settings will appear here.',
  },
} as const;
