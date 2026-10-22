// ONE list of every API request. The Postman collection, the Bruno collection, the API reference and the
// smoke test are all generated from this file, so they can never disagree with each other.
//
// Variables ({{name}}) come from the environment (baseUrl, phone, otp) or are saved from earlier responses.
// `vars` run BEFORE the request, `save` run AFTER it. Both are plain JavaScript expressions.
// Helpers available in `vars`: day(n) = India date n days from today, at(n, 'HH:MM') = ISO time in India.
// In `checks`: res.status, res.body, and v('name') = a saved or environment variable.

export const environment = {
  baseUrl: 'http://localhost:3000',
  phone: '+919876543210',
  // Works only while the API runs with DEV_FIXED_OTP=123456 (development). Never in production.
  otp: '123456',
};

// Set before every request, so dates are always in the future.
export const collectionVars = {
  slotDate: "day(3)",
  startsAtEvening: "at(3, '18:00')",
  startsAtLater: "at(3, '19:00')",
  startsAtMorning: "at(4, '07:00')",
};

export const folders = [
  {
    name: 'Health',
    steps: [
      { name: 'Alive', method: 'GET', path: '/health', expect: 200, about: 'Is the process up? Used by the load balancer.', checks: [["status is ok", "res.body.status === 'ok'"]] },
      { name: 'Ready', method: 'GET', path: '/health/ready', expect: 200, about: 'Can the API reach the database?', checks: [["status is ok", "res.body.status === 'ok'"]] },
    ],
  },
  {
    name: 'Sign in',
    steps: [
      { name: 'Request OTP', method: 'POST', path: '/v1/auth/otp/request', body: { phone: '{{phone}}' }, expect: 200, about: 'Sends a 6-digit code to an Indian mobile number. One code per 30 seconds, 5 per hour.', checks: [["resend wait is returned", "typeof res.body.resendAfterSeconds === 'number'"]] },
      { name: 'Verify OTP', method: 'POST', path: '/v1/auth/otp/verify', body: { phone: '{{phone}}', code: '{{otp}}' }, expect: 200, about: 'Exchanges the code for tokens. First sign-in creates the customer. Saves the tokens for the other requests.', save: { accessToken: 'res.body.token', refreshToken: 'res.body.refreshToken' }, checks: [["has access token", "typeof res.body.token === 'string'"], ["has refresh token", "typeof res.body.refreshToken === 'string'"]] },
    ],
  },
  {
    name: 'Profile',
    steps: [
      { name: 'Get my profile', method: 'GET', path: '/v1/me', auth: true, expect: 200, about: 'The signed-in customer.', checks: [["phone matches", "res.body.phone === v('phone')"]] },
      { name: 'Update my profile', method: 'PATCH', path: '/v1/me', auth: true, body: { firstName: 'Ritesh', lastName: 'Sharma', email: 'ritesh.test@example.com' }, expect: 200, about: 'First name is required (2 to 60 characters). Email must be unique.', checks: [["name saved", "res.body.firstName === 'Ritesh'"]] },
    ],
  },
  {
    name: 'Catalog',
    steps: [
      { name: 'List services', method: 'GET', path: '/v1/services', expect: 200, about: 'Active services with styles and prices in paise (no sign-in needed).', checks: [["has services", "res.body.length > 0"], ["prices are in paise", "typeof res.body[0].pricePaise.scheduled === 'number'"]] },
    ],
  },
  {
    name: 'Addresses',
    steps: [
      { name: 'Check serviceability (served)', method: 'POST', path: '/v1/addresses/serviceability', auth: true, body: { pincode: '400050' }, expect: 200, about: 'Do we serve this pincode yet? True only if its cluster is active.', checks: [["answer is boolean", "typeof res.body.serviceable === 'boolean'"]] },
      { name: 'Check serviceability (not served)', method: 'POST', path: '/v1/addresses/serviceability', auth: true, body: { pincode: '110001' }, expect: 200, about: 'A pincode outside every cluster.', checks: [["not serviceable", "res.body.serviceable === false"]] },
      { name: 'Add address', method: 'POST', path: '/v1/addresses', auth: true, body: { label: 'Home', line: 'A-1203, Rustomjee Seasons', area: 'Bandra West, Mumbai', pincode: '400050', latitude: 19.0596, longitude: 72.8295 }, expect: 201, about: 'Saving is always allowed. The first address becomes the default. The same address twice is saved once.', save: { addressId: 'res.body.id' }, checks: [["has id", "typeof res.body.id === 'string'"]] },
      { name: 'Add address outside service area', method: 'POST', path: '/v1/addresses', auth: true, body: { label: 'Office', line: 'Connaught Place, Block A', area: 'New Delhi', pincode: '110001' }, expect: 201, about: 'Allowed, but marked serviceable: false and cannot be booked.', save: { outsideAddressId: 'res.body.id' }, checks: [["not serviceable", "res.body.serviceable === false"]] },
      { name: 'List addresses', method: 'GET', path: '/v1/addresses', auth: true, expect: 200, about: 'Default first.', checks: [["has addresses", "res.body.length >= 2"]] },
      { name: 'Set default address', method: 'PUT', path: '/v1/addresses/{{addressId}}/default', auth: true, expect: 200, about: 'Returns the updated list.', checks: [["chosen is first", "res.body[0].id === v('addressId')"]] },
      { name: 'Delete address', method: 'DELETE', path: '/v1/addresses/{{outsideAddressId}}', auth: true, expect: 200, about: 'Returns the updated list. Refused (409 ADDRESS_IN_USE) while a session is booked there.', checks: [["one left", "res.body.length === 1"]] },
    ],
  },
  {
    name: 'Slots',
    steps: [
      { name: 'Get slots for a day', method: 'GET', path: '/v1/slots', auth: true, query: { service: 'yoga', date: '{{slotDate}}' }, expect: 200, about: 'Eight start times in India time. available is false for past times and times already booked.', checks: [["eight slots", "res.body.length === 8"]] },
    ],
  },
  {
    name: 'Bookings',
    steps: [
      { name: 'Create scheduled booking', method: 'POST', path: '/v1/bookings', auth: true, vars: { bookingKey: "'req-' + Date.now()" }, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', participant: 'personal', addressId: '{{addressId}}', startsAt: '{{startsAtEvening}}', idempotencyKey: '{{bookingKey}}' }, expect: 201, about: 'The idempotencyKey makes a retry safe: same key, same booking.', save: { bookingId: 'res.body.id' }, checks: [["status is matching", "res.body.status === 'matching'"], ["price is 1500 rupees", "res.body.totalPaise === 150000"]] },
      { name: 'Retry the same booking (same key)', method: 'POST', path: '/v1/bookings', auth: true, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', participant: 'personal', addressId: '{{addressId}}', startsAt: '{{startsAtEvening}}', idempotencyKey: '{{bookingKey}}' }, expect: 201, about: 'Returns the SAME booking, not a second one.', checks: [["same booking id", "res.body.id === v('bookingId')"]] },
      { name: 'Book the same time again (conflict)', method: 'POST', path: '/v1/bookings', auth: true, vars: { otherKey: "'req-' + Date.now() + '-b'" }, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', participant: 'personal', addressId: '{{addressId}}', startsAt: '{{startsAtEvening}}', idempotencyKey: '{{otherKey}}' }, expect: 409, about: 'A second live session at the same start time is refused: SLOT_CONFLICT.', checks: [["conflict code", "res.body.error.code === 'SLOT_CONFLICT'"]] },
      { name: 'Create instant booking', method: 'POST', path: '/v1/bookings', auth: true, vars: { instantKey: "'req-' + Date.now() + '-i'" }, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'instant', participant: 'personal', addressId: '{{addressId}}', idempotencyKey: '{{instantKey}}' }, expect: 201, about: 'No start time: we find the first free coach.', save: { instantBookingId: 'res.body.id' }, checks: [["no start time", "res.body.startsAt === null"], ["price is 1899 rupees", "res.body.totalPaise === 189900"]] },
      { name: 'Create demo booking', method: 'POST', path: '/v1/bookings', auth: true, vars: { demoKey: "'req-' + Date.now() + '-d'" }, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'demo', participant: 'personal', addressId: '{{addressId}}', startsAt: '{{startsAtLater}}', idempotencyKey: '{{demoKey}}' }, expect: 201, about: 'The discounted first session.', save: { demoBookingId: 'res.body.id' }, checks: [["price is 500 rupees", "res.body.totalPaise === 50000"]] },
      { name: 'List my bookings', method: 'GET', path: '/v1/bookings', auth: true, expect: 200, about: 'Newest first. Only mine.', checks: [["has my bookings", "res.body.length >= 3"]] },
      { name: 'Get one booking', method: 'GET', path: '/v1/bookings/{{bookingId}}', auth: true, expect: 200, about: 'canChange says whether cancel and reschedule are still allowed.', checks: [["can change", "res.body.canChange === true"]] },
      { name: 'Reschedule booking', method: 'POST', path: '/v1/bookings/{{bookingId}}/reschedule', auth: true, body: { startsAt: '{{startsAtMorning}}' }, expect: 201, about: 'Allowed until 2 hours before the session. Instant bookings cannot be rescheduled.', checks: [["moved to morning", "res.body.whenLabel.includes('7:00 AM')"]] },
      { name: 'Cancel booking', method: 'POST', path: '/v1/bookings/{{bookingId}}/cancel', auth: true, expect: 201, about: 'Cancelling twice is not an error.', checks: [["cancelled", "res.body.status === 'cancelled'"]] },
      { name: 'Cancel demo booking', method: 'POST', path: '/v1/bookings/{{demoBookingId}}/cancel', auth: true, expect: 201, about: 'Frees the 7 PM slot so this collection can be run again.', checks: [["cancelled", "res.body.status === 'cancelled'"]] },
      { name: 'Cancel instant booking', method: 'POST', path: '/v1/bookings/{{instantBookingId}}/cancel', auth: true, expect: 201, about: 'Instant bookings can be cancelled while we search.', checks: [["cancelled", "res.body.status === 'cancelled'"]] },
    ],
  },
  {
    name: 'Errors (what a failure looks like)',
    steps: [
      { name: 'No token', method: 'GET', path: '/v1/me', expect: 401, about: 'Every failure has the same shape: { error: { code, message, details } }.', checks: [["code", "res.body.error.code === 'UNAUTHORIZED'"]] },
      { name: 'Bad phone number', method: 'POST', path: '/v1/auth/otp/request', body: { phone: '+14155550123' }, expect: 400, about: 'Only Indian mobile numbers (+91) are accepted.', checks: [["code", "res.body.error.code === 'INVALID_PHONE'"]] },
      { name: 'Booking with a missing time', method: 'POST', path: '/v1/bookings', auth: true, vars: { badKey: "'req-' + Date.now() + '-x'" }, body: { serviceSlug: 'yoga', formatSlug: 'power-yoga', mode: 'scheduled', addressId: '{{addressId}}', idempotencyKey: '{{badKey}}' }, expect: 400, about: 'A scheduled booking needs startsAt.', checks: [["code", "res.body.error.code === 'INVALID_REQUEST'"]] },
    ],
  },
  {
    name: 'Session',
    steps: [
      { name: 'Refresh tokens', method: 'POST', path: '/v1/auth/refresh', body: { refreshToken: '{{refreshToken}}' }, expect: 200, about: 'Returns a new pair. The old refresh token stops working; using it again signs the customer out everywhere.', save: { accessToken: 'res.body.token', refreshToken: 'res.body.refreshToken' }, checks: [["new token", "typeof res.body.token === 'string'"]] },
      { name: 'Sign out', method: 'POST', path: '/v1/auth/logout', body: { refreshToken: '{{refreshToken}}' }, expect: 204, about: 'Ends this device. Always 204.' },
    ],
  },
];
