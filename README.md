# ShiftSync — Multi-Location Staff Scheduling Platform

**Live Demo:**
- Frontend: https://shift-sync-zeta.vercel.app/
- Backend API: https://shift-sync.up.railway.app/api
- Swagger Docs: https://shift-sync.up.railway.app/api/docs

---

## Test Credentials

| Role | Email | Password | Scope |
|------|-------|----------|-------|
| Admin | admin@coastaleats.com | Admin123! | All 4 locations, full system access |
| Manager (West) | manager.west@coastaleats.com | Manager123! | Los Angeles + San Diego |
| Manager (East) | manager.east@coastaleats.com | Manager123! | New York + Miami |
| Staff — Sarah | sarah.jones@coastaleats.com | Staff123! | LA + NY (timezone scenario) |
| Staff — John | john.smith@coastaleats.com | Staff123! | LA + SD (near overtime) |
| Staff — Aisha | aisha.patel@coastaleats.com | Staff123! | All 4 locations, all skills |
| Staff — Maria | maria.garcia@coastaleats.com | Staff123! | LA only, server + host |
| Staff — Tyler | tyler.brooks@coastaleats.com | Staff123! | LA + SD, bartender |

---

## Running Locally (without Docker)

### Prerequisites

- Node.js 20+
- PostgreSQL 16 running locally

### 1. Create the database

```bash
createdb shiftsync
```

If your local Postgres requires a user/password, create one first:

```bash
psql postgres -c "CREATE USER shiftsync WITH PASSWORD 'shiftsync';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE shiftsync TO shiftsync;"
```

### 2. Start the backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL=postgresql://shiftsync:shiftsync@localhost:5432/shiftsync
JWT_SECRET=any-random-string-here
PORT=4000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

Then:

```bash
npm install
npm run start:dev
```

On first boot the server will:
1. Create all database tables (idempotent — safe to restart)
2. Detect if the database is empty and run the seed automatically

You should see in the terminal:
```
✅ Database schema ready
🌱 Running seed...
✅ Seed complete
ShiftSync API running on port 4000
```

### 3. Start the frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

App runs at http://localhost:3000

---

## Debugging: Local database has users but no shifts/schedule data

This is the most common local setup issue. It happens when the seed ran once and created users, but failed midway (e.g. the `availability` skill array syntax caused a Postgres error), so no shifts, locations, or assignments were created. On subsequent restarts, the seed guard sees `users.count > 0` and skips the seed.

**To verify what's in your database:**

```bash
psql postgresql://shiftsync:shiftsync@localhost:5432/shiftsync
```

Then run these queries:

```sql
-- Should be 11 rows (admin + 2 managers + 8 staff)
SELECT COUNT(*) FROM users;

-- Should be 4 rows (LA, SD, NY, Miami)
SELECT COUNT(*) FROM locations;

-- Should be 14+ rows
SELECT COUNT(*) FROM shifts;

-- Should be 10+ rows
SELECT COUNT(*) FROM shift_assignments;
```

**If locations / shifts are 0 but users > 0**, the seed partially ran. Fix it by resetting and re-seeding:

```bash
psql postgresql://shiftsync:shiftsync@localhost:5432/shiftsync \
  -c "TRUNCATE audit_logs, notifications, swap_requests, shift_assignments, shifts, availability_exceptions, availability, manager_locations, user_locations, locations, users CASCADE;"
```

Then restart the backend — it will detect the empty database and re-seed cleanly.

**Alternatively, run the seed manually:**

```bash
cd backend
DATABASE_URL=postgresql://shiftsync:shiftsync@localhost:5432/shiftsync \
  npx ts-node -r tsconfig-paths/register src/database/seed.ts
```

---

## API Documentation

Swagger UI: http://localhost:4000/api/docs (local) or https://shift-sync.up.railway.app/api/docs (production)

All endpoints require a Bearer token. Get one by calling `POST /api/auth/login`.

---

## Architecture

| Layer | Technology |
|-------|------------|
| Backend | NestJS + TypeScript |
| Database | PostgreSQL 16 + Drizzle ORM |
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Real-time | Socket.IO (WebSocket gateway) |
| Auth | JWT + bcrypt + Passport |

---

## Project Structure

```
shiftsync/
├── backend/
│   ├── src/
│   │   ├── database/
│   │   │   ├── schema.ts        # Drizzle schema (9 tables)
│   │   │   ├── init.ts          # Auto-migrate + seed on boot
│   │   │   ├── seed-runner.ts   # Seed data (all 4 locations, 11 users, shifts)
│   │   │   └── db.ts            # DB connection
│   │   ├── modules/
│   │   │   ├── auth/            # JWT login, guards, decorators
│   │   │   ├── shifts/          # CRUD, publish, assign, constraint engine
│   │   │   ├── swaps/           # Swap/drop workflow
│   │   │   ├── users/           # Profiles, availability, certifications
│   │   │   ├── locations/       # Location directory + staff rosters
│   │   │   ├── notifications/   # WebSocket gateway + in-app notifications
│   │   │   ├── analytics/       # Hours distribution, fairness, overtime
│   │   │   └── audit/           # Immutable change log
│   │   └── main.ts
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js App Router pages
│   │   │   ├── auth/login/
│   │   │   ├── dashboard/
│   │   │   ├── schedule/
│   │   │   ├── swaps/
│   │   │   ├── availability/
│   │   │   ├── analytics/
│   │   │   ├── notifications/
│   │   │   └── admin/
│   │   ├── components/
│   │   │   └── shifts/          # CreateShiftModal, ShiftDetailPanel
│   │   └── lib/
│   │       ├── api.ts           # Axios client + all API calls
│   │       ├── auth.tsx         # Auth context + token verification
│   │       ├── socket.ts        # Socket.IO hook
│   │       └── dates.ts         # Timezone-aware date utilities
│   └── package.json
└── README.md
```

---

## Running Tests

```bash
cd backend
npm test              # all unit tests
npm run test:cov      # with coverage report
```

Tests cover: all 9 constraint rules, auth flows, analytics calculations, timezone handling.
