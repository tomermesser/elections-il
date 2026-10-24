// Change the name a name + PIN player signs in with and appears under (until the lock).
// The PIN stays the same; the old name becomes free for others.
import { db, settings, nameOwner } from "../../lib/db.js";
import { currentUser, sameOriginJson, PIN_PREFIX } from "../../lib/auth.js";
import { cleanName, PICKS_CLOSE } from "../../lib/game.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "צריך להתחבר" });
  if (!user.email.startsWith(PIN_PREFIX)) return res.status(400).json({ error: "את השם משנים בטופס הניחוש" });
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "צריך למלא שם" });
  const key = user.email.slice(PIN_PREFIX.length);
  try {
    const sql = await db();
    const s = await settings(sql);
    if (s.locked_at || Date.now() >= Date.parse(PICKS_CLOSE)) return res.status(423).json({ error: "אחרי הנעילה אי אפשר לשנות שם" });

    const owner = await nameOwner(sql, name);
    const mine = owner?.kind === "pin" && owner.key === key;
    if (owner && !mine) return res.status(409).json({ error: "השם הזה כבר תפוס, בחר שם אחר" });

    const [acc] = await sql`select display_name from accounts where email = ${key}`;
    if (!acc) return res.status(404).json({ error: "החשבון לא נמצא. התנתק והתחבר מחדש." });
    const old = acc.display_name;
    try {
      await sql`update accounts set display_name = ${name} where email = ${key}`;
      await sql`update picks set name = ${name} where email = ${user.email}`;
    } catch (e) {
      // Someone took the name a moment ago: put the old one back.
      if (e?.code === "23505") {
        await sql`update accounts set display_name = ${old} where email = ${key}`;
        return res.status(409).json({ error: "השם הזה כבר תפוס, בחר שם אחר" });
      }
      throw e;
    }
    res.status(200).json({ ok: true, name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
