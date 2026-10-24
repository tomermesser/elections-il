# הימורי בחירות 2026

Seat-prediction pool for friends. Static frontend (`public/index.html`) + Vercel serverless API (`api/`) + Neon Postgres. Sign-in with Google.

## What the server enforces
- Nobody (admin included) gets other players' picks from the API before the lock.
- After the lock (manual, or the auto-lock deadline) the server rejects every new pick or edit, in the same SQL statement that writes it.
- Picks are validated server-side (known parties, integers, totals of 120, turnout 0–100).
- One entry per Google account; display names are unique.
- Settings and scoring rules are frozen once locked. Only `ADMIN_EMAILS` can change settings, lock, or publish results.

## Environment variables
| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (added automatically by the Vercel ↔ Neon integration) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client (Web application) from Google Cloud Console |
| `SESSION_SECRET` | random string, 32+ chars (`openssl rand -hex 32`) |
| `ADMIN_EMAILS` | comma-separated organizer emails |
| `BASE_URL` | optional, e.g. `https://my-app.vercel.app` (otherwise taken from the request host) |

Google OAuth client: authorized redirect URI `https://<your-domain>/api/auth/callback`. Publish the consent screen ("In production") so any Google account can sign in; only the basic `openid email profile` scopes are used, so no verification is needed.

Tables are created automatically on first request.
