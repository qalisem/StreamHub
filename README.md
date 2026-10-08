# StreamHub (CPS714 Group 15)

Movie/Show Subscription System. Sprint 1 delivers accounts, catalog browsing, search and filters, title detail pages, and admin title management.

**Team:** Qasem Ali (Product Owner), Akshith Akubathini (Scrum Master), Immanuel Gnanaseelan (Developer)

## Tech stack
- Frontend: React 18 + Vite + React Router
- Backend: Node.js + Express REST API
- Database: SQLite (better-sqlite3), file `server/streamhub.db`
- Auth: bcrypt password hashing, JWT sessions (30 min)
- Tests: Jest + Supertest

## Run it
Requires Node 18+.

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

## Tests
```bash
cd server
npm test
```
27 automated tests covering stories 1 to 5, role checks, validation, SQL injection, and search performance on 1,000 titles.

## API
| Method | Path | Access | Story |
|---|---|---|---|
| POST | /api/auth/register | Public | 1 |
| POST | /api/auth/login | Public | 1 |
| GET | /api/auth/me | Logged in | 1 |
| GET | /api/titles?q=&genre=&type=&yearFrom=&yearTo=&minRating=&sort=&page= | Public | 3, 4 |
| GET | /api/titles/genres | Public | 4 |
| GET | /api/titles/:id | Public | 5 |
| POST | /api/titles | Admin, Content Manager | 2 |
| PUT | /api/titles/:id | Admin, Content Manager | 2 |
| DELETE | /api/titles/:id | Admin, Content Manager (soft delete) | 2 |

## Structure
```
server/
  src/app.js           Express app and routes
  src/db.js            Schema
  src/seed.js          Demo users and titles
  src/middleware/auth.js  JWT and role checks
  src/routes/auth.js   Register, login, me
  src/routes/titles.js Catalog and admin CRUD
  tests/               Jest test suites
client/
  src/pages/           Login, Register, Catalog, TitleDetail, Admin
  src/auth.jsx         Session context
  src/api.js           Fetch wrapper
```
