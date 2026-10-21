# StreamHub (CPS714 Group 15)

Movie/Show Subscription System. Sprint 2 adds subscription plans, mock checkout, plan changes and cancellation, account editing, and tier-gated playback.

**Team:** Qasem Ali (Product Owner), Akshith Akubathini (Scrum Master), Immanuel Gnanaseelan (Developer)

## Tech stack
- Frontend: React 19 + Vite + React Router
- Backend: Node.js + Express REST API
- Database: SQLite (better-sqlite3), file `server/streamhub.db`
- Auth: bcrypt password hashing, JWT sessions (30 min)
- Tests: Jest + Supertest

## Run it
Requires Node 22+.

```bash
# 1. API (port 4000). Seeds demo users and 50 titles on first run.
cd server
npm install
npm start

# 2. Client (port 5173), in a second terminal
cd client
npm install
npm run dev
```
Open http://localhost:5173.

Single-server option: `cd client && npm run build`, then `cd ../server && npm start` and open http://localhost:4000.

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@streamhub.test | Admin123 |
| Content Manager | content@streamhub.test | Content123 |
| Subscriber | user@streamhub.test | User1234 |
| Basic Subscriber | basic@streamhub.test | Basic1234 |

## Test cards

No real payment is made. Use any future expiry date and a 3- or 4-digit CVV.

| Number | Result |
|---|---|
| 4242 4242 4242 4242 | Succeeds |
| 5555 5555 5555 4444 | Succeeds |
| 4000 0000 0000 0002 | Declined |

## Tests
```bash
cd server
npm test
```
53 automated tests covering stories 1 to 9 and 22, including subscription state transitions, payment-data security, role checks, validation, SQL injection, and search performance on 1,000 titles.

## API
| Method | Path | Access | Story |
|---|---|---|---|
| POST | /api/auth/register | Public | 1 |
| POST | /api/auth/login | Public | 1 |
| GET | /api/auth/me | Logged in | 1 |
| PUT | /api/auth/me | Logged in | 22 |
| PUT | /api/auth/password | Logged in | 22 |
| GET | /api/plans | Public | 6 |
| GET | /api/subscription | Logged in | 7 |
| POST | /api/subscription | Logged in | 7 |
| POST | /api/subscription/change | Logged in | 8 |
| POST | /api/subscription/cancel | Logged in | 8 |
| GET | /api/titles?q=&genre=&type=&yearFrom=&yearTo=&minRating=&sort=&page= | Public | 3, 4 |
| GET | /api/titles/genres | Public | 4 |
| GET | /api/titles/:id | Public | 5 |
| POST | /api/titles/:id/play | Logged in | 9 |
| POST | /api/titles | Admin, Content Manager | 2 |
| PUT | /api/titles/:id | Admin, Content Manager | 2 |
| DELETE | /api/titles/:id | Admin, Content Manager (soft delete) | 2 |

## Structure
```
server/
  src/app.js           Express app and routes
  src/db.js            Schema
  src/seed.js          Demo users and titles
  src/payments.js      Mock card validation and charge outcomes
  src/middleware/auth.js  JWT and role checks
  src/routes/auth.js   Register, login, me
  src/routes/plans.js  Public plan catalog
  src/routes/subscriptions.js  Checkout and subscription lifecycle
  src/routes/titles.js Catalog and admin CRUD
  tests/               Jest test suites
client/
  src/pages/           Login, Register, Catalog, TitleDetail, Admin
  src/auth.jsx         Session context
  src/api.js           Fetch wrapper
```
