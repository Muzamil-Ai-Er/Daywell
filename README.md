# Daywell — your personal productivity companion

Daywell is a React + Tailwind application with a FastAPI backend, Supabase Auth, and user-owned Supabase PostgreSQL data. It includes tasks and reminders, a daily planner, focus and study tools, budgeting, personal settings, and Gemini-powered Ask Daywell.

## Account and data security

- Supabase Auth provides email/password sign-up, login, persistent sessions, password reset, and logout.
- The browser uses only the Supabase project URL and its public anon/publishable key. Supabase Auth stores and refreshes the session. Every private frontend request sends the access token to FastAPI.
- FastAPI verifies each token with Supabase Auth, derives the account ID from the verified response, and sends the same JWT to PostgREST. The backend does not accept a caller-supplied owner ID and does not require a service-role key or database password.
- The SQL migration creates account-owned profiles, tasks, schedules, budgets, preferences, focus sessions, and import markers. Every table has a foreign key to `auth.users`, owner indexes where needed, and forced Row Level Security policies. The policies check `auth.uid()` for reads and writes.
- Gemini credentials stay on the backend. Ask Daywell loads task and budget context from rows protected by the authenticated user's JWT; it ignores private records supplied by the browser.
- A new account starts with an empty task list, default 9–5 hours, INR, and light appearance. Existing browser data is never copied automatically. If older Daywell keys are found in that browser, the signed-in user can explicitly import them once into that account or dismiss the offer. The import function derives its owner from `auth.uid()`.
- Supabase Auth sessions are persisted by the official client SDK in the browser so users can reopen the app and refresh their session. `localStorage` is not used as the app database; it is only checked for explicit legacy import and short-lived notification markers.

## Supabase setup

1. Create a Supabase project and enable the project's Auth and PostgreSQL Data API.
2. In **SQL Editor**, run [`supabase/migrations/20261112000100_daywell_cloud_data.sql`](supabase/migrations/20261112000100_daywell_cloud_data.sql). This creates the account-owned tables, grants, indexes, RLS policies, and one-time legacy import RPC.
3. Then run [`supabase/migrations/20261112000200_persist_active_focus_session.sql`](supabase/migrations/20261112000200_persist_active_focus_session.sql). This adds a single owner-only row for a paused or running focus timer so it can resume after refresh or login.
4. In **Authentication → Providers**, enable Email and choose whether to require email confirmation. In **Authentication → URL Configuration**, set the local Site URL to `http://localhost:5173` and add that origin to the allowed redirect URLs. Add your deployed Vercel origin as a Site URL/allowed redirect URL before production use. Email confirmation and password reset links return to the application origin. Configure a production SMTP sender if your Auth project requires one for reliable confirmation/reset delivery.
5. Copy the project's URL and **public anon/publishable key** from the Supabase API settings. Do not use a `service_role` or secret key in the frontend. Daywell does not need a service-role key.
6. For local development, copy the example environment files and fill only the placeholders described below. The same Supabase URL and public key go in frontend and backend configuration.

Run the migrations in order. If the first migration is already installed, run only the second migration. Both migrations are rerunnable and make additive changes. Supabase credentials were not provided in this project, so live signup, email delivery, and database requests are not preconfigured or claimed as working.

## Local development

Requirements: Node.js 20+ and Python 3.11+.

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Set these values in `backend/.env`:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
GEMINI_API_KEY=your-Gemini-key
GEMINI_MODEL=gemini-3.5-flash-lite
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:4173
RATE_LIMIT_PER_MINUTE=20
```

`SUPABASE_ANON_KEY` is the public project key; never put a Supabase service-role key, database password, or Gemini key in frontend variables. Start the API:

```powershell
uvicorn main:app --reload --port 8000
```

`GET http://localhost:8000/health` reports whether the backend sees Supabase and Gemini configuration, without returning credentials.

### Frontend

In another terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env
```

Set `frontend/.env`:

```dotenv
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

Then start Vite:

```powershell
npm run dev
```

Open `http://localhost:5173`. `VITE_*` values are embedded in the public frontend bundle; only the Supabase public anon/publishable key belongs there. Never prefix private keys with `VITE_`.

## Tests and build

Frontend tests exercise Supabase Auth, authenticated request wiring for every account-data section, and preference helpers. Backend tests mock Supabase Auth/PostgREST to verify token enforcement, account-derived ownership, section-by-section save/reload round trips, task CRUD, focus-session resume state, and cross-account isolation:

```powershell
cd frontend
npm test
npm run build

cd ..\backend
pip install -r requirements-dev.txt
pytest
```

These tests do not replace a live integration test against your Supabase project. After configuration, register two separate email accounts, create a task under each account, sign in on separate browser profiles/devices, and confirm neither workspace can read, update, or delete the other's records. Test email confirmation, forgot-password links, logout, session refresh, and explicit legacy import using your configured Auth redirect URLs.

## Deployment

### Vercel frontend

Use `frontend` as the project root, the Vite framework preset, `npm run build`, and `dist` as the output directory. Configure:

- `VITE_API_URL` — deployed FastAPI origin, for example `https://your-api.onrender.com`
- `VITE_SUPABASE_URL` — the Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — the Supabase public anon/publishable key

Add the deployed Vercel origin to Supabase Auth's site and redirect URL settings.

### Render FastAPI backend

Use `backend` as the service root, `pip install -r requirements.txt` as the build command, and `uvicorn main:app --host 0.0.0.0 --port $PORT` as the start command. Configure:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (public project key; the access token still determines the user and RLS identity)
- `GEMINI_API_KEY` and optionally `GEMINI_MODEL`
- `ALLOWED_ORIGINS` with the exact deployed frontend origin
- optionally `RATE_LIMIT_PER_MINUTE`

Keep these values in Render's backend environment settings. Do not add Supabase service-role keys, database credentials, or Gemini keys to Vercel. Apply the SQL migration to the Supabase project before using the app. Review the free-plan limits and current service terms for Supabase, Vercel, Render, and Gemini separately; this repository cannot guarantee provider quotas or account eligibility.

## Gemini and privacy

The backend uses Google's official `google-genai` Python SDK and defaults to `gemini-3.5-flash-lite`. Configure `GEMINI_API_KEY` only on the backend. Ask Daywell sends the current user's question, recent conversation turns, and relevant task/budget context to Gemini. Chat turns are held in the current page session and are not stored in the Daywell database. Do not send passwords, payment credentials, or other sensitive secrets to the assistant. Gemini quotas and data terms depend on Google's current project settings; check the official Gemini API documentation before production use.

## Notes

- The budget defaults to INR. Currency and theme are account preferences; changing currency changes display formatting and does not convert the underlying amounts.
- Browser desktop notifications work only while Daywell is open and the user has granted browser permission.
- The account profile email is managed by Supabase Auth. Name, role, and focus are stored in the owner-only `profiles` table.
- The project contains no real API keys or Supabase credentials. `.env.example` files contain placeholders only.
