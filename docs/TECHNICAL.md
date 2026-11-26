# StreamHub Technical Documentation

Version 1.0 (Sprint 4 release). CPS714 Group 15.

## 1. Architecture

```
Browser (React 19 + Vite build)
   |  HTTPS, JSON, Bearer token
   v
Express 5 API (server/src/app.js)  ---- serves client/dist and /uploads
   |-- middleware/auth.js   JWT check, role check, deactivated-account check
   |-- routes/*.js          one router per area (auth, titles, subscriptions, ...)
   |-- billing.js           all time-based subscription rules (renewal, expiry, reminders)
   |-- payments.js          mock card validation and charge outcomes
   |-- email.js             email templates and the outbox
   |-- posters.js           poster image validation and storage
   v
SQLite (better-sqlite3, WAL mode)       uploads/posters/*.png|jpg|webp
```

One Node process serves both the API (`/api/...`) and the built React client. `createApp(db, { now, uploadDir })` takes the database, a clock, and the upload folder as parameters so tests can run on an in-memory database with a fake clock and a temporary folder.

## 2. Data model

| Table | Purpose | Key rules |
|---|---|---|
| users | Accounts | Unique email, bcrypt hash, role subscriber / content_manager / admin, `active` flag |
| titles | Movies and shows | Soft delete (`deleted`), required plan `tier` |
| episodes | Seasons and episodes of shows (Story 23) | Unique (title, season, episode); season and episode 1 to 99 |
| plans | Basic, Standard, Premium | Price in cents, `rank` for tier checks |
| subscriptions | One current subscription per user | Status active / cancelled / past_due / expired; `pending_plan_code` for downgrades; `reminder_sent_for` (Story 15) |
| payments | Every charge | Kind subscription / upgrade / renewal / retry; only the card's last 4 digits are stored |
| watchlist | My List | One row per user and title |
| watch_history | Continue Watching | One row per user and title; `last_episode_id` for shows |
| episode_progress | Position in each episode (Story 23) | One row per user and episode |
| reviews | Ratings 1 to 5 and text | One review per user and title |
| email_outbox | Every email sent (Story 15) | Template name, subject, body, recipient |
| password_resets | Reset links (Story 15) | Only the SHA-256 hash of the token is stored; 30 minute expiry; single use |

Schema changes are applied on startup (`CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE` for added columns), so an existing `streamhub.db` keeps working after an upgrade.

## 3. Key design decisions

- **One place for subscription rules.** `billing.refreshSubscription()` runs inside a transaction every time a subscription is read. It expires cancelled plans, applies pending downgrades, charges renewals (one per missed period, never twice), sets Past Due on a declined card, and sends the renewal reminder 3 days before renewal (once per period).
- **Email outbox.** Every email is a row in `email_outbox`. The demo and the tests read it directly. A real provider (for example Amazon SES, chosen in the Sprint 4 procurement analysis) would send the rows; the rest of the app does not change.
- **Password reset without account discovery.** `POST /api/auth/forgot` gives the same answer for known and unknown emails. Tokens are 32 random bytes, stored only as a hash, expire after 30 minutes, and using one cancels the user's other open links.
- **Safe poster uploads.** Images come as a base64 data URL. The server checks the declared type is PNG, JPEG, or WebP, checks the file's real signature matches that type, limits size to 2 MB, and saves it under a generated name. Replacing a poster deletes the old upload.
- **Server-side authorization.** Every protected route checks the token and role on the server. Deactivated accounts are rejected even with a valid token.

## 4. API reference

Access: P = public, L = logged in, S = staff (admin or content manager), A = admin.

| Method | Path | Access | Story |
|---|---|---|---|
| POST | /api/auth/register | P | 1, 15 (welcome email) |
| POST | /api/auth/login | P | 1 |
| GET, PUT | /api/auth/me | L | 1, 22 |
| PUT | /api/auth/password | L | 22 |
| POST | /api/auth/forgot | P | 15 |
| POST | /api/auth/reset | P (token) | 15 |
| GET | /api/plans | P | 6 |
| GET, POST | /api/subscription | L | 7 |
| POST | /api/subscription/change | L | 8 |
| POST | /api/subscription/cancel | L | 8, 15 (confirmation email) |
| POST | /api/subscription/retry | L | 13 |
| GET | /api/payments, /api/payments/:id | L (own only) | 13 |
| GET | /api/titles (q, genre, type, yearFrom, yearTo, minRating, sort, page) | P | 3, 4 |
| GET | /api/titles/genres, /api/titles/:id | P | 4, 5 |
| POST, PUT, DELETE | /api/titles, /api/titles/:id | S | 2 |
| POST | /api/titles/:id/poster | S | 24 |
| POST | /api/titles/:id/play, /api/titles/:id/progress | L + plan tier | 9, 11 |
| GET | /api/titles/:id/episodes | P | 23 |
| POST | /api/titles/:id/episodes | S | 23 |
| DELETE | /api/titles/:id/episodes/:episodeId | S | 23 |
| GET | /api/titles/:id/episodes/progress | L | 23 |
| POST | /api/titles/:id/episodes/:episodeId/progress | L + plan tier | 23 |
| GET, PUT, DELETE | /api/titles/:id/reviews, /api/titles/:id/review | P / L | 12 |
| DELETE | /api/reviews/:id | S | 12 |
| GET, POST, DELETE | /api/watchlist, /api/watchlist/:titleId | L | 10 |
| GET | /api/history, /api/history/continue | L | 11, 23 |
| GET, PATCH | /api/admin/users, /api/admin/users/:id | A | 14 |
| POST | /api/admin/users/:id/subscription/extend, /cancel | A | 14 |
| PUT | /api/admin/plans/:code | A | 14 |
| GET | /api/admin/emails | A | 15 |

Errors are JSON `{ "error": "message" }` with status 400 (validation), 401 (login needed), 402 (plan needed or Past Due), 403 (role or tier), 404, 409 (duplicate), 413 (file too large).

## 5. Testing

| Level | Where | Count |
|---|---|---|
| Acceptance (API, end to end through Express) | `server/tests/*.test.js` | 123 |
| Unit (one module, no HTTP) | `server/tests/unit/*.unit.test.js` | 51 |
| Manual UI scenarios (browser) | Sprint reports | 10 per sprint |

Run `cd server && npm test`. Coverage at release: 95.75% statements, 97.99% lines.

Time-based rules (renewals, reminders, reset link expiry) are tested with the injectable clock in `tests/helpers.js` (`ctx.advance(days)` or set `ctx.clock.t`).

## 6. Deployment

1. `cd client && npm ci && npm run build`
2. `cd server && npm ci`
3. Set `JWT_SECRET` (required in production), `APP_URL` (the public address used in emails), `DB_FILE` and `UPLOAD_DIR` on a persistent disk.
4. `npm start` (listens on `PORT`, default 4000).

The Sprint 4 supplier evaluation recommends a small always-on instance with a persistent disk, so the SQLite file and uploads survive restarts.
