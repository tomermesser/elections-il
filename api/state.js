import { db, settings } from "../lib/db.js";
import { currentUser, isAdmin, displayEmail, googleEnabled, PIN_PREFIX } from "../lib/auth.js";
import { config, PICKS_CLOSE, POLLS_CLOSE } from "../lib/game.js";
import { myGroups } from "../lib/groups.js";

const asPick = (r) => ({ name: r.name, seats: r.seats, blocs: r.blocs, turnout: Number(r.turnout) });

export default async function handler(req, res) {
  try {
    const user = await currentUser(req);
    const sql = await db();
    const s = await settings(sql);
    const c = config(s.config);
    const lockedAt = s.locked_at ? new Date(s.locked_at).toISOString() : null;

    const all = await sql`select email, name, seats, blocs, turnout, updated_at from picks order by created_at`;
    const mineRow = user ? all.find((r) => r.email === user.email) : null;

    // Boards show one group: the one asked for, else the player's first. No group, no board.
    const groups = user ? await myGroups(sql, user.email) : [];
    const asked = new URL(req.url, "http://x").searchParams.get("group");
    const group = groups.find((g) => g.id === asked) || groups[0] || null;
    const members = group ? new Set((await sql`select member from memberships where group_id = ${group.id}`).map((m) => m.member)) : new Set();
    const rows = all.filter((r) => members.has(r.email));
    const entrants = rows.map((r) => ({ name: r.name, updatedAt: r.updated_at, mine: !!user && r.email === user.email }));
    let fixedName = null;
    if (user && user.email.startsWith(PIN_PREFIX)) {
      const [acc] = await sql`select display_name from accounts where email = ${user.email.slice(PIN_PREFIX.length)}`;
      fixedName = acc?.display_name || null;
    }
    const label = !user ? "" : user.email.startsWith(PIN_PREFIX) ? (fixedName || mineRow?.name || displayEmail(user.email)) : user.email;

    // Other people's picks only leave the server after the lock, and only as they were at lock time.
    const picks = lockedAt
      ? rows.filter((r) => new Date(r.updated_at) <= new Date(lockedAt)).map((r) => ({ ...asPick(r), mine: !!user && r.email === user.email }))
      : null;

    res.status(200).json({
      config: c,
      lockedAt,
      results: lockedAt ? s.results : null,
      me: user ? { email: label, googleName: user.name, fixedName, isAdmin: isAdmin(user.email) } : null,
      googleEnabled: googleEnabled(),
      picksClose: PICKS_CLOSE,
      pollsClose: POLLS_CLOSE,
      groups: groups.map((g) => ({ id: g.id, name: g.name, code: g.code, role: g.role, members: g.members })),
      group: group ? { id: group.id, name: group.name } : null,
      totalEntrants: all.length,
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
