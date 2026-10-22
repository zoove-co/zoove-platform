# Zoove API reference

Generated from `steps.mjs`. Do not edit by hand: change `steps.mjs` and run `node api-client/generate.mjs`.

Every failure looks like `{ "error": { "code", "message", "details" } }`. Money is in paise (150000 = Rs 1,500). Times are UTC in responses; slots are defined in India time.

### Health

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Alive | `GET /health` | no | 200 | Is the process up? Used by the load balancer. |
| Ready | `GET /health/ready` | no | 200 | Can the API reach the database? |

### Sign in

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Request OTP | `POST /v1/auth/otp/request` | no | 200 | Sends a 6-digit code to an Indian mobile number. One code per 30 seconds, 5 per hour. |
| Verify OTP | `POST /v1/auth/otp/verify` | no | 200 | Exchanges the code for tokens. First sign-in creates the customer. Saves the tokens for the other requests. |

### Profile

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Get my profile | `GET /v1/me` | yes | 200 | The signed-in customer. |
| Update my profile | `PATCH /v1/me` | yes | 200 | First name is required (2 to 60 characters). Email must be unique. |

### Catalog

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| List services | `GET /v1/services` | no | 200 | Active services with styles and prices in paise (no sign-in needed). |

### Addresses

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Check serviceability (served) | `POST /v1/addresses/serviceability` | yes | 200 | Do we serve this pincode yet? True only if its cluster is active. |
| Check serviceability (not served) | `POST /v1/addresses/serviceability` | yes | 200 | A pincode outside every cluster. |
| Add address | `POST /v1/addresses` | yes | 201 | Saving is always allowed. The first address becomes the default. The same address twice is saved once. |
| Add address outside service area | `POST /v1/addresses` | yes | 201 | Allowed, but marked serviceable: false and cannot be booked. |
| List addresses | `GET /v1/addresses` | yes | 200 | Default first. |
| Set default address | `PUT /v1/addresses/{{addressId}}/default` | yes | 200 | Returns the updated list. |
| Delete address | `DELETE /v1/addresses/{{outsideAddressId}}` | yes | 200 | Returns the updated list. Refused (409 ADDRESS_IN_USE) while a session is booked there. |

### Slots

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Get slots for a day | `GET /v1/slots` | yes | 200 | Eight start times in India time. available is false for past times and times already booked. |

### Bookings

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Create scheduled booking | `POST /v1/bookings` | yes | 201 | The idempotencyKey makes a retry safe: same key, same booking. |
| Retry the same booking (same key) | `POST /v1/bookings` | yes | 201 | Returns the SAME booking, not a second one. |
| Book the same time again (conflict) | `POST /v1/bookings` | yes | 409 | A second live session at the same start time is refused: SLOT_CONFLICT. |
| Create instant booking | `POST /v1/bookings` | yes | 201 | No start time: we find the first free coach. |
| Create demo booking | `POST /v1/bookings` | yes | 201 | The discounted first session. |
| List my bookings | `GET /v1/bookings` | yes | 200 | Newest first. Only mine. |
| Get one booking | `GET /v1/bookings/{{bookingId}}` | yes | 200 | canChange says whether cancel and reschedule are still allowed. |
| Reschedule booking | `POST /v1/bookings/{{bookingId}}/reschedule` | yes | 201 | Allowed until 2 hours before the session. Instant bookings cannot be rescheduled. |
| Cancel booking | `POST /v1/bookings/{{bookingId}}/cancel` | yes | 201 | Cancelling twice is not an error. |
| Cancel demo booking | `POST /v1/bookings/{{demoBookingId}}/cancel` | yes | 201 | Frees the 7 PM slot so this collection can be run again. |
| Cancel instant booking | `POST /v1/bookings/{{instantBookingId}}/cancel` | yes | 201 | Instant bookings can be cancelled while we search. |

### Errors (what a failure looks like)

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| No token | `GET /v1/me` | no | 401 | Every failure has the same shape: { error: { code, message, details } }. |
| Bad phone number | `POST /v1/auth/otp/request` | no | 400 | Only Indian mobile numbers (+91) are accepted. |
| Booking with a missing time | `POST /v1/bookings` | yes | 400 | A scheduled booking needs startsAt. |

### Session

| Request | Method and path | Sign-in | Expect | What it does |
|---|---|---|---|---|
| Refresh tokens | `POST /v1/auth/refresh` | no | 200 | Returns a new pair. The old refresh token stops working; using it again signs the customer out everywhere. |
| Sign out | `POST /v1/auth/logout` | no | 204 | Ends this device. Always 204. |
