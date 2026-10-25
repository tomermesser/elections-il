# הימורי בחירות 2026

Seat-prediction pool for friends. Static frontend (`public/index.html`) + Vercel serverless API (`api/`) + Neon Postgres. Sign-in with Google, or with a display name + a personal PIN.

## What the server enforces
- Nobody (admin included) gets other players' picks from the API before the lock.
- After the lock (manual, or the auto-lock deadline) the server rejects every new pick or edit, in the same SQL statement that writes it.
- Picks are validated server-side (known parties, integers, totals of 120, turnout 0–100).
- One entry per account; display names are unique.
- Name + PIN sign-in: the first sign-in with a free name claims it with a 4–8 digit PIN (scrypt hash); later sign-ins with that name need the same PIN, and 5 wrong PINs lock the name for 15 minutes. A name that belongs to someone (a PIN account, or a Google player's pick) can't be claimed by anyone else. Accounts created by the earlier email + PIN flow keep their picks: they sign in with the name on their pick and their old PIN. These identities are stored as `pin:<key>`, separate from Google accounts, so they can't act as an admin unless listed with the prefix in `ADMIN_EMAILS`.
- Groups: each player has one pick; boards (entrants, picks after the lock, stats, ranking) show only the selected group's members. Anyone signed in can open a group (becoming its admin) and invite with `/?join=<code>`; the group admin or a site admin can replace the code. On first run, the group "בחירות-26" (id `main`) is created with everyone who already had a pick or account. Lock time and results are shared by all groups. Group admins (and site admins, in every group) can remove members until the lock; anyone can leave a group. Removing or leaving only deletes the membership: the pick stays. The page gets opaque member refs (HMAC of group + member), never emails or account keys.
- Settings and scoring rules are frozen once locked. Only `ADMIN_EMAILS` can change settings, lock, or publish results.

## Environment variables
| Name | Value |
|---|---|
| `DATABASE_URL` | Neon connection string (added automatically by the Vercel ↔ Neon integration) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth client (Web application) from Google Cloud Console. Optional: without them the Google button is hidden and only email sign-in is offered |
| `SESSION_SECRET` | random string, 32+ chars (`openssl rand -hex 32`) |
| `ADMIN_EMAILS` | comma-separated organizer emails |
| `BASE_URL` | optional, e.g. `https://my-app.vercel.app` (otherwise taken from the request host) |

Google OAuth client: authorized redirect URI `https://<your-domain>/api/auth/callback`. Publish the consent screen ("In production") so any Google account can sign in; only the basic `openid email profile` scopes are used, so no verification is needed.

Tables are created automatically on first request.
