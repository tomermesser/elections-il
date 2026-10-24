import { db, settings } from "../lib/db.js";
import { currentUser, isAdmin, displayEmail, googleEnabled } from "../lib/auth.js";
import { config } from "../lib/game.js";

const asPick = (r) => ({ name: r.name, seats: r.seats, blocs: r.blocs, turnout: Number(r.turnout) });

export default async function handler(req, res) {
  try {
    const user = await currentUser(req);
    const sql = await db();
    const s = await settings(sql);
    const c = config(s.config);
    const lockedAt = s.locked_at ? new Date(s.locked_at).toISOString() : null;

    const rows = await sql`select email, name, seats, blocs, turnout, updated_at from picks order by created_at`;
    const entrants = rows.map((r) => ({ name: r.name, updatedAt: r.updated_at, mine: !!user && r.email === user.email }));
    const mineRow = user ? rows.find((r) => r.email === user.email) : null;

    // Other people's picks only leave the server after the lock, and only as they were at lock time.
    const picks = lockedAt
      ? rows.filter((r) => new Date(r.updated_at) <= new Date(lockedAt)).map((r) => ({ ...asPick(r), mine: !!user && r.email === user.email }))
      : null;

    res.status(200).json({
      config: c,
      lockedAt,
      results: lockedAt ? s.results : null,
      me: user ? { email: displayEmail(user.email), googleName: user.name, isAdmin: isAdmin(user.email) } : null,
      googleEnabled: googleEnabled(),
      myPick: mineRow ? { ...asPick(mineRow), updatedAt: mineRow.updated_at } : null,
      entrants,
      picks,
      serverTime: new Date().toISOString()
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
