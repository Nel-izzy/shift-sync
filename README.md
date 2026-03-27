# ShiftSync — Multi-Location Staff Scheduling Platform

Built for Coastal Eats restaurant group (4 locations, 2 time zones).

## Quick Start

### Option A — Docker (recommended)

```bash
docker compose up --build
```

Runs backend on :4000, frontend on :3000, Postgres on :5432.
Seed data is loaded automatically on first boot.

### Option B — Local Development

**Prerequisites:** Node 20+, PostgreSQL 16

```bash
# 1. Start Postgres and create DB
createdb shiftsync
createuser shiftsync --password shiftsync

# 2. Backend
cd backend
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npm run db:migrate          # push schema via Drizzle
npm run db:seed             # load test data
npm run start:dev           # runs on :4000

# 3. Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                 # runs on :3000
```

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@coastaleats.com | Admin123! |
| Manager (LA + SD) | manager.west@coastaleats.com | Manager123! |
| Manager (NY + Miami) | manager.east@coastaleats.com | Manager123! |
| Staff — Sarah (LA + NY) | sarah.jones@coastaleats.com | Staff123! |
| Staff — John (near OT) | john.smith@coastaleats.com | Staff123! |
| Staff — Aisha (all locations) | aisha.patel@coastaleats.com | Staff123! |

## Running Tests

```bash
cd backend
npm test              # all unit tests
npm run test:cov      # with coverage report
```

## API Documentation

Swagger UI: http://localhost:4000/api/docs

## Architecture

- **Backend:** NestJS + TypeScript, Drizzle ORM, PostgreSQL, Socket.IO
- **Frontend:** Next.js 14 (App Router), React Query, Tailwind CSS
- **Real-time:** WebSocket gateway for live schedule updates and notifications
