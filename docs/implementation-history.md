# Submit Form Careers - Implementation History

## Scope

This document records implementation decisions and verified behavior so the
final project report can distinguish the current demo architecture from the
planned synchronous submission architecture.

No API keys, webhook secrets, service-role keys, database passwords, or other
secret values are stored in this document.

## Phase 1: Asynchronous Database Webhook

### Architecture

```text
React form
  -> Supabase Storage (private CV bucket)
  -> public.applications
  -> Database webhook
  -> resend Edge Function
  -> Resend API
  -> HR email
```

### Supabase resources

- Project reference: `rhggiogyynmuomfuxheu`
- Tables: `public.positions`, `public.applications`
- Private bucket: `cv ung tuyen`
- Database trigger: `send_application_emails`
- Edge Function: `resend`
- Production secrets: `RESEND_API_KEY`, `WEBHOOK_SECRET`

### Implemented behavior

- The React form loads active positions from `public.positions`.
- The browser uploads a sanitized, UUID-prefixed CV filename to Storage.
- The browser inserts the application record after the upload succeeds.
- The database webhook invokes `resend` after an application is inserted.
- The function authenticates the webhook with `x-webhook-secret`.
- The function resolves the position title and creates a seven-day signed CV
  URL.
- The HR email includes candidate name, email, position, cover letter,
  submission time, and the signed CV link.
- The current Resend test sender attempts an applicant confirmation email, but
  test mode only permits delivery to the Resend account email.

### Verified results

Verified on June 14, 2026:

- A request with an incorrect webhook secret returned HTTP `401`.
- The deployed `resend` function was active with JWT verification disabled.
- End-to-end webhook responses returned HTTP `200`.
- Resend accepted the HR email.
- Applicant confirmation failure was returned as `sent: false` without failing
  the HR notification.
- Synthetic application and CV test data were removed after verification.

### Demo decision and limitation

The webhook architecture is retained for the working demo. A form submission
is considered successful when the CV upload and application insert succeed.
Email delivery happens asynchronously afterward.

Consequently, the browser cannot know whether the HR email was delivered when
it displays its success message. Email failures must be inspected through Edge
Function logs or `net._http_response`.

For a production version, use a synchronous submission Edge Function or add an
email delivery state such as `pending`, `sent`, and `failed`.

## Phase 2: Case 1 - Frontend CV Validation

Implemented locally:

- Accept `.pdf`, `.doc`, and `.docx`.
- Reject filenames longer than 255 characters.
- Reject unsupported extensions with:
  `Chỉ hỗ trợ file PDF, DOC hoặc DOCX`.
- Reject files larger than 5MB with:
  `File CV không được vượt quá 5MB`.
- Assign `application/msword` when uploading a `.doc` file.

Verification:

- Production build passed.
- ESLint passed.
- Boundary checks for 255/256-character filenames passed.
- PDF, DOC, DOCX, PNG, ZIP, 5MB, and greater-than-5MB checks passed.

The Storage bucket MIME configuration was updated in Case 3 to allow
`application/msword`, so `.doc` uploads can now pass the bucket restriction.

## Phase 3: Case 2 - Parallel Synchronous Contract

The `submit-application` Edge Function is introduced as a safe parallel
contract. During Case 2 it:

- accepts `multipart/form-data`;
- validates basic fields and active position membership;
- returns structured validation errors;
- returns HTTP `501` after successful validation because persistence and email
  orchestration are intentionally deferred.

It does not upload files, insert applications, send email, disable the webhook,
or change the React submission flow.

Later cases will add backend file validation, Storage/database rollback,
synchronous HR email handling, and finally switch React only after the new
pipeline is verified.

### Case 2 deployment result

Verified on June 15, 2026:

- `submit-application` was deployed alongside `resend`.
- `GET` returned HTTP `405` with `METHOD_NOT_ALLOWED`.
- A JSON request returned HTTP `415` with `UNSUPPORTED_MEDIA_TYPE`.
- Multipart data with missing fields returned HTTP `400` and field-level
  validation messages.
- An invalid email returned HTTP `400` with `fieldErrors.email`.
- A valid but unknown position UUID returned HTTP `400` with
  `INVALID_POSITION`.
- A fully valid contract request returned HTTP `501` with
  `SUBMISSION_PIPELINE_NOT_IMPLEMENTED`.
- These contract tests did not upload a CV, insert an application, or send
  email.

The React form remains connected to the original Storage/database/webhook
pipeline. The existing `resend` function and `send_application_emails` trigger
remain enabled.

## Phase 4: Case 3 - Backend CV Validation

The parallel `submit-application` function now validates CV files before
performing the active-position lookup. It still does not upload files, insert
applications, or send email.

Validation runs in this order:

1. File exists and is not empty.
2. Full filename is no longer than 255 characters.
3. Extension is `.pdf`, `.doc`, or `.docx`.
4. File size is no more than 5MB.
5. Declared MIME type matches the extension. An empty MIME type or
   `application/octet-stream` is allowed only when content validation passes.
6. File content matches the expected format:
   - PDF begins with the `%PDF-` signature.
   - DOC begins with the OLE Compound File signature.
   - DOCX is a ZIP container with `[Content_Types].xml` and
     `word/document.xml`.

CV validation failures return a stable HTTP status and error code, plus
`fieldErrors.cv` for later frontend integration. A valid submission continues
to return HTTP `501` with `SUBMISSION_PIPELINE_NOT_IMPLEMENTED` until Case 4.

The private `cv ung tuyen` bucket configuration now records a 5MB limit and
allows PDF, legacy DOC, and DOCX MIME types. Legacy DOC validation confirms the
shared OLE container; deeper Office document inspection and antivirus scanning
remain production follow-up work.

### Case 3 deployment result

Verified on June 15, 2026:

- `submit-application` version 2 was deployed and reported `ACTIVE`.
- The existing `resend` function remained `ACTIVE`.
- The bucket migration was applied to the linked remote database.
- Missing CV returned HTTP `400` with `VALIDATION_ERROR`.
- A 256-character filename returned HTTP `400` with
  `CV_FILE_NAME_TOO_LONG`.
- Unsupported extension, mismatched MIME type, and false file content returned
  their expected HTTP `400` codes.
- A file larger than 5MB returned HTTP `413` with `CV_TOO_LARGE`.
- Valid PDF, DOC, and DOCX requests reached HTTP `501` with
  `SUBMISSION_PIPELINE_NOT_IMPLEMENTED`.
- Unit tests covered valid formats, filename boundaries, generic MIME handling,
  validation precedence, false PDF content, and generic ZIP content renamed to
  DOCX.

The function still contains no upload, insert, or email side effects, so the
working React/database/webhook demo flow is unchanged.

## Phase 5: Case 4 - Persistence And Rollback

The parallel `submit-application` function now persists validated applications:

1. It uploads the CV to the private `cv ung tuyen` bucket.
2. It inserts the application into `public.applications`.
3. It removes the uploaded CV if the database insert fails.

CV objects use the generated path:

```text
edge/{positionId}/{randomUUID}.{extension}
```

The original filename is not included in the Storage path. The upload MIME type
comes from the backend-validated extension.

### Submission source

The `applications.submission_source` column identifies the active flow:

- `browser` is the default for the existing React/database/webhook demo.
- `edge_function` is written by `submit-application`.

The `resend` webhook function returns HTTP `200` with
`EDGE_FUNCTION_SUBMISSION` when it receives an Edge Function application.
This prevents Case 4 from sending email before synchronous email handling is
implemented in Case 5, while preserving the existing browser webhook flow.

### Persistence responses

- Upload failure: HTTP `500`, `CV_UPLOAD_FAILED`.
- Insert failure after successful rollback: HTTP `500`,
  `APPLICATION_INSERT_FAILED`.
- Insert and rollback failure: HTTP `500`, `ROLLBACK_FAILED`.
- Successful persistence: HTTP `201`, `APPLICATION_PERSISTED`.

### Case 4 deployment result

Verified on June 15, 2026:

- The submission source migration was applied to the linked project.
- `resend` version 2 and `submit-application` version 3 reported `ACTIVE`.
- A valid PDF submission returned HTTP `201` with an application ID.
- A simulated webhook payload with `submission_source: edge_function` returned
  HTTP `200`, `skipped: true`, and `EDGE_FUNCTION_SUBMISSION`.
- Persistence and CV validation suites passed 18 tests.
- Deno check and lint passed.
- Frontend production build and ESLint passed without changing the React
  submission flow.
- The application row and Storage object created by the production verification
  were deleted afterward.

Case 5 will add synchronous HR email delivery before the Edge Function returns
overall success.

## Phase 6: Case 5 - Synchronous HR Email

The `submit-application` function now waits for Resend to accept the HR email
before returning success:

```text
Validate
  -> Upload CV
  -> Insert application as pending
  -> Create signed CV URL
  -> Send HR email
  -> Update email status
  -> Return API response
```

### Shared email service

Both `submit-application` and the existing `resend` webhook use one shared HR
email service. It:

- sends only the HR email;
- uses a ten-second timeout per request;
- retries once after 500ms for network failures, HTTP 408, HTTP 429, and HTTP
  5xx responses;
- does not retry non-retryable client errors;
- uses `hr-application/{applicationId}` as the Resend idempotency key;
- escapes candidate-controlled values in the HTML template.

Applicant confirmation email was removed to match the MVP requirements.

### Email status

Applications now contain:

- `hr_email_status`: `not_tracked`, `pending`, `accepted`, or `failed`;
- `hr_email_id`;
- `hr_email_error`;
- `hr_email_sent_at`.

An email failure keeps the application and CV for investigation, sets the
status to `failed`, and returns HTTP `502` with `HR_EMAIL_FAILED`. A signed URL
failure returns HTTP `500` with `CV_LINK_FAILED`.

When Resend accepts the HR email, `submit-application` returns HTTP `201` with
`APPLICATION_SUBMITTED`, the application ID, and the Resend email ID.

### Case 5 deployment result

Verified on June 15, 2026:

- The HR email status migration was applied to the linked project.
- `resend` version 3 and `submit-application` version 4 reported `ACTIVE`.
- A synchronous Edge Function submission returned HTTP `201` with
  `APPLICATION_SUBMITTED` and a Resend email ID.
- Its database row changed to `hr_email_status: accepted`.
- A browser-style anonymous Storage upload and application insert triggered the
  database webhook and also changed to `accepted`.
- Edge Function records remained excluded from webhook email delivery.
- Email, persistence, and CV validation suites passed 24 tests.
- Deno check/lint and frontend build/lint passed.
- The two verification application rows and their two CV objects were deleted.

Resend acceptance confirms that the provider accepted the email request. Inbox
delivery confirmation would require a later Resend delivery webhook.

## Phase 7: Case 6 - React Uses Submit Application

The React form now sends one multipart request to the synchronous
`submit-application` Edge Function:

```text
React FormData
  -> submit-application
  -> Storage
  -> applications
  -> Resend HR email
  -> synchronous API response
```

The browser no longer uploads directly to Storage or inserts directly into
`applications`. Active positions are still loaded from the database.

### Frontend behavior

- Form strings are trimmed before being appended to `FormData`.
- The existing CV frontend validation and UI are retained.
- The Edge Function invocation has a 30-second client timeout.
- Backend `fieldErrors` are mapped to React Hook Form fields.
- `INVALID_POSITION` is shown on the position field.
- Other network, relay, persistence, signed URL, and email failures show:
  `Không thể gửi hồ sơ. Vui lòng thử lại.`
- The form resets only after receiving HTTP `201` with
  `APPLICATION_SUBMITTED`.
- React Hook Form keeps the submit button disabled while the request is active.

### Case 6 verification

Verified on June 15, 2026:

- The production build and ESLint passed.
- Source inspection confirmed React no longer calls `supabase.storage` or
  inserts into `applications`.
- A `supabase-js` multipart invocation with invalid data returned
  `FunctionsHttpError` with field errors for all required fields.
- A valid invocation returned `APPLICATION_SUBMITTED`, an application ID, and
  an HR email ID.
- The resulting application had `submission_source: edge_function` and
  `hr_email_status: accepted`.
- The verification application and CV object were deleted afterward.

Automated UI interaction could not run because the local in-app browser failed
to start in the Windows environment. The compiled frontend and its exact
Supabase invocation contract were still verified.

## Phase 8: Case 7 - Turnstile and Submission Rate Limit

Case 7 adds two anti-spam controls before any CV upload, application insert, or
HR email:

```text
Frontend validation
  -> Cloudflare Turnstile token
  -> Backend Siteverify
  -> Backend CV and position validation
  -> Atomic hashed-IP rate limit
  -> Existing persistence and email pipeline
```

### Cloudflare Turnstile

The React form explicitly renders the Turnstile widget with action
`submit_application`. It sends the one-time token as `turnstileToken`, disables
submission until a token exists, and resets the widget after every request.

Local Vite development falls back to Cloudflare's visible always-pass test site
key. Production requires `VITE_TURNSTILE_SITE_KEY`.

The Edge Function:

- requires a non-empty token no longer than 2048 characters;
- validates it through Cloudflare Siteverify with a five-second timeout;
- includes the client IP when available;
- requires the action to equal `submit_application`;
- validates `TURNSTILE_EXPECTED_HOSTNAME` when that optional secret is set;
- never logs the raw token or raw client IP.

Backend secrets required by Case 7:

- `TURNSTILE_SECRET_KEY`;
- `RATE_LIMIT_SALT`;
- optional `TURNSTILE_EXPECTED_HOSTNAME`.

For local testing, Cloudflare's always-pass test secret can be used with the
development test site key. Test keys must not be used for production rollout.

### Rate limit

Migration `20260615030000_add_application_rate_limits.sql` creates:

- private table `private.application_rate_limits`;
- service-role-only RPC `public.consume_application_rate_limit`.

The Edge Function takes the IP from `CF-Connecting-IP`, then the first
`X-Forwarded-For` value, or uses `unknown`. It stores only a salted SHA-256
hash, never the raw IP.

The RPC atomically allows five validated application attempts per IP hash in a
15-minute fixed window. A rejected request returns HTTP `429`, code
`RATE_LIMITED`, and a `Retry-After` header.

### Case 7 API responses

- Missing token: HTTP `400`, `CAPTCHA_REQUIRED`.
- Invalid or reused token: HTTP `400`, `CAPTCHA_INVALID`.
- Siteverify unavailable: HTTP `503`, `CAPTCHA_UNAVAILABLE`.
- Rate-limit storage unavailable: HTTP `503`, `RATE_LIMIT_UNAVAILABLE`.
- Limit exceeded: HTTP `429`, `RATE_LIMITED`.

No Storage object, application row, or email is created when one of these
checks rejects the request.

### Case 7 verification

Verified on June 15, 2026:

- Migration `20260615030000` was applied to the linked Supabase project and
  confirmed in remote migration history.
- A random 256-bit `RATE_LIMIT_SALT` was stored in Supabase Secrets.
- Frontend production build passed.
- Frontend ESLint passed.
- Deno check and lint passed.
- All 35 Deno tests passed, including Turnstile action/hostname rejection,
  Siteverify failure handling, IP header precedence, salted hashing, and rate
  limit RPC response handling.
- The official Cloudflare always-pass test response was verified. Because the
  test response does not include the configured action, the backend skips the
  action check only when the exact official always-pass test secret is active.
  Production secrets still require the `submit_application` action.
- The Vite development server started successfully, but automated browser
  inspection remained unavailable because the Windows browser sandbox could
  not start in this environment.

### Case 7 deployment result

- The Cloudflare always-pass test secret was uploaded to Supabase Secrets.
- `submit-application` version 9 reported `ACTIVE`.
- A request without a token returned HTTP `400`, `CAPTCHA_REQUIRED`.
- A token longer than 2048 characters returned HTTP `400`, `CAPTCHA_INVALID`.
- A request using the official dummy token passed Siteverify and then returned
  HTTP `400`, `INVALID_CV_CONTENT` for an intentionally fake PDF. This confirms
  that Turnstile validation completed before CV validation.
- These verification requests did not upload a CV, insert an application, or
  send an email.

Case 7 is now deployed for localhost/demo testing. The official test keys
always pass and therefore do not provide production CAPTCHA protection. Before
publishing the frontend, replace both keys with a real Cloudflare widget pair
and configure `TURNSTILE_EXPECTED_HOSTNAME`.

## Phase 9: Case 8 - Automated Acceptance Tests

Case 8 adds repeatable frontend acceptance tests for AC-01 through AC-08 using
Vitest, Testing Library, jsdom, and user-event.

The frontend test replaces external dependencies with controlled fakes:

- the positions query returns one active `Developer` position;
- the Turnstile widget issues a test token;
- the Edge Function invocation returns the response required by each case;
- toast calls are captured without rendering a notification container.

No acceptance test uploads to production Storage, inserts an application, or
sends a real email.

### Frontend validation module

The Zod schema was moved to `career-form-schema.ts` so the form and tests use
the same validation rules. This also corrected the empty email behavior:

- empty email: `Vui lòng nhập email`;
- invalid email: `Email không hợp lệ`.

Existing CV messages remain:

- missing: `Vui lòng đính kèm CV`;
- unsupported type: `Chỉ hỗ trợ file PDF, DOC hoặc DOCX`;
- over 5MB: `File CV không được vượt quá 5MB`;
- filename over 255 characters: `Tên file CV quá dài`.

### AC coverage matrix

| AC | Automated assertion |
| --- | --- |
| AC-01 | Valid form invokes `submit-application` once and shows success only after `APPLICATION_SUBMITTED`. |
| AC-02 | Empty email shows `Vui lòng nhập email` and does not invoke the Edge Function. |
| AC-03 | Invalid email shows `Email không hợp lệ` and does not invoke the Edge Function. |
| AC-04 | Missing CV shows `Vui lòng đính kèm CV` and does not invoke the Edge Function. |
| AC-05 | PNG CV shows the supported-type message and does not invoke the Edge Function. |
| AC-06 | CV over 5MB shows the size message and does not invoke the Edge Function. |
| AC-07 | Edge Function/HR email failure shows `Không thể gửi hồ sơ. Vui lòng thử lại sau`. Resend retry and terminal failure behavior is also covered by Deno tests. |
| AC-08 | While the first invocation is unresolved, the submit button is disabled and a second click does not create another request. |

### Case 8 verification

Verified on June 15, 2026:

- Frontend acceptance suite: 8 passed, 0 failed.
- Backend Deno suite: 35 passed, 0 failed.
- Frontend production build passed.
- Frontend ESLint passed.
- Deno check and lint passed.
- `npm audit` reported no vulnerabilities after adding the test dependencies.

These are component and service tests, not a full browser E2E run against
production. Browser automation remains unavailable in the current Windows
sandbox, while production email acceptance was already verified during
Case 5 and the deployed Turnstile API contract was verified during Case 7.

## Phase 10: Case 9 - Reproducible Database Schema and Seed

Case 9 adds the missing database foundation required to recreate the project
from Git instead of manually configuring a new Supabase Dashboard.

### Foundation migration

Migration `20260614000000_create_application_schema.sql` runs before all
existing additive migrations and creates or normalizes:

- `public.positions`;
- `public.applications`;
- the foreign key from applications to positions;
- indexes for active position lookup, position applications, and submission
  time;
- private Storage bucket `cv ung tuyen`;
- Row Level Security and explicit table grants.

The migration is idempotent. Existing tables, rows, and Storage objects are not
deleted when it is applied to an already configured project.

### Access rules

The resulting access model is:

- `anon` and `authenticated` can select active positions only;
- browser roles cannot select, insert, update, or delete applications;
- browser roles have no Storage object policy for the CV bucket;
- `service_role` can read positions and manage applications;
- the trusted `submit-application` Edge Function remains the only active
  submission path.

The migration removes legacy policies from `public.applications`. It also
removes policies from `storage.objects` only when their policy expression
explicitly references `cv ung tuyen`. The legacy database webhook itself is
retained for the later production cutover case.

### Seed data

`supabase/seed.sql` adds:

- `Developer`;
- `Designer`.

New databases receive deterministic UUIDs. Re-running the seed checks titles
case-insensitively and does not create duplicate positions.

### Case 9 deployment result

Verified on June 15, 2026:

- The foundation migration was applied to the linked Supabase project with
  `--include-all`.
- All five local migrations match the remote migration history.
- Existing `Developer` and `Designer` positions remained active.
- Anonymous active-position read returned HTTP `200`.
- Anonymous application read returned HTTP `401`.
- Anonymous application insert returned HTTP `401`.
- Anonymous CV upload was rejected by Storage RLS.
- A valid-CV request with a nonexistent position returned `INVALID_POSITION`,
  confirming the Edge Function service role still reads positions without
  creating an application or Storage object.
- Frontend acceptance tests passed: 8 of 8.
- Backend Deno tests passed: 35 of 35.
- Frontend build, ESLint, Deno check, and Deno lint passed.

`supabase db reset` could not be executed locally because Docker Desktop is not
running. The migration was instead validated against the linked remote project
and its public/service-role access contracts were tested directly.

## Phase 11: Test Source Cleanup

On June 15, 2026, automated test source was removed from the repository after
the user completed testing. This cleanup removed:

- the frontend CareerForm acceptance test and Vitest setup;
- backend Deno test files for persistence, CV validation, HR email, rate limit,
  and Turnstile;
- Vitest, Testing Library, user-event, and jsdom dependencies;
- the `npm test` script and Vite test configuration.

The production implementation, migrations, seed data, and historical QA results
were retained. Future changes now require manual regression testing unless an
automated test suite is added again.

## Phase 12: Rate Limit RPC Hotfix

On June 15, 2026, `submit-application` returned HTTP `503` with
`RATE_LIMIT_UNAVAILABLE`. The database migration existed and required secrets
were present, but the RPC failed at runtime.

The PL/pgSQL variable `current_time` conflicted with PostgreSQL's built-in
`CURRENT_TIME`, producing a `time with time zone` value where the rate-limit
table required `timestamptz`.

Migration `20260615040000_fix_application_rate_limit_timestamp.sql` replaces the
variable with `v_now`. After applying the migration, the RPC returned the
expected `allowed`, `request_count`, and `retry_after_seconds` values. No Edge
Function redeploy was required.
