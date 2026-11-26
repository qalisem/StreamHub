# StreamHub (CPS714 Group 15)

Movie/Show Subscription System built with Scrum over four sprints for a simulated client, Northlight Media.

**Team:** Qasem Ali (Product Owner), Akshith Akubathini (Scrum Master), Immanuel Gnanaseelan (Developer)

| Sprint | Delivered |
|---|---|
| 1 | Accounts, roles, catalog browse, search and filters, title details, admin title management |
| 2 | Subscription plans, mock checkout, plan changes and cancellation, tier-gated playback, profile editing |
| 3 | Monthly renewal, Past Due and card retry, billing history and receipts, watchlist, watch history and Continue Watching, ratings and reviews, admin user and plan management |
| 4 | Email notifications and password reset, seasons and episodes, poster image upload, system testing and documentation |

Guides: [User guide](docs/USER_GUIDE.md) · [Technical documentation](docs/TECHNICAL.md)

## Tech stack
- Frontend: React 19, Vite, React Router
- Backend: Node.js (22, see `.nvmrc`), Express 5 REST API
- Database: SQLite (better-sqlite3), file `server/streamhub.db`
- Auth: bcrypt password hashing, JWT sessions (30 minutes)
- Tests: Jest and Supertest (acceptance and unit), Playwright (manual UI scenarios)

## Run it
```bash
# Build the client once
cd client && npm install && npm run build

# Start the API and website on port 4000 (seeds demo data on first run)
cd ../server && npm install && npm start
```
Open http://localhost:4000. To reset the demo data, stop the server and delete `server/streamhub.db`.

Development mode with hot reload: run `npm start` in `server` and `npm run dev` in `client`, then open http://localhost:5173.

Environment variables (all optional): `PORT` (4000), `DB_FILE` (streamhub.db), `JWT_SECRET`, `APP_URL` (links in emails), `UPLOAD_DIR` (poster uploads, default `server/uploads`).

## Demo accounts
| Role | Email | Password |
|---|---|---|
| Admin | admin@streamhub.test | Admin123 |
| Content Manager | content@streamhub.test | Content123 |
| Subscriber (no plan) | user@streamhub.test | User1234 |
| Subscriber (Basic plan) | basic@streamhub.test | Basic1234 |

## Test cards
No real payment is made. Use any future expiry date and a 3 or 4 digit CVV.

| Number | Result |
|---|---|
| 4242 4242 4242 4242 | Succeeds |
| 4000 0000 0000 0002 | Declined at checkout |
| 4000 0000 0000 0341 | Succeeds at checkout, declines at the next renewal |

## Emails
Emails are written to an outbox table. Admins can read them at **Emails** in the menu (`/admin/emails`). This is how to get a password reset link in the demo.

## Tests
```bash
cd server
npm test
```
174 automated tests in 17 suites: acceptance tests for every story (`tests/story*.test.js`, `auth`, `titles`, `subscriptions`) and unit tests for the payment, billing, email, poster, and auth modules (`tests/unit`).

See [Technical documentation](docs/TECHNICAL.md) for the full API, data model, and test list.
