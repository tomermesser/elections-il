import { db, settings } from "../lib/db.js";
import { currentUser, sameOriginJson } from "../lib/auth.js";
import { config, parsePick } from "../lib/game.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "צריך להתחבר" });
  try {
    const sql = await db();
    const s = await settings(sql);
    if (s.locked_at) return res.status(423).json({ error: "ההימורים כבר ננעלו" });
    const { pick, error } = parsePick(req.body, config(s.config).parties);
    if (error) return res.status(400).json({ error });

    // The lock check is part of the same statement, so a pick can't slip in after the lock.
    const rows = await sql`
      insert into picks (email, name, seats, blocs, turnout)
      select ${user.email}, ${pick.name}, ${JSON.stringify(pick.seats)}::jsonb, ${JSON.stringify(pick.blocs)}::jsonb, ${pick.turnout}
      from settings
      where id = 1 and locked_at is null
        and (config->>'deadline' is null or now() < (config->>'deadline')::timestamptz)
      on conflict (email) do update
        set name = excluded.name, seats = excluded.seats, blocs = excluded.blocs,
            turnout = excluded.turnout, updated_at = now()
        where (select locked_at is null
                 and (config->>'deadline' is null or now() < (config->>'deadline')::timestamptz)
               from settings where id = 1)
      returning updated_at`;
    if (!rows.length) return res.status(423).json({ error: "ההימורים כבר ננעלו" });
    res.status(200).json({ ok: true, updatedAt: rows[0].updated_at });
  } catch (e) {
    if (e?.code === "23505") return res.status(409).json({ error: "השם הזה כבר תפוס, בחר שם אחר" });
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
