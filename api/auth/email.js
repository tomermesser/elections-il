import { db } from "../../lib/db.js";
import { sameOriginJson, sessionCookie, hashPin, checkPin, PIN_PREFIX } from "../../lib/auth.js";
import { cleanName } from "../../lib/game.js";

const MAX_FAILS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const body = req.body || {};
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = cleanName(body.name);
  const pin = String(body.pin ?? "");
  if (!name) return res.status(400).json({ error: "צריך למלא שם" });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "כתובת המייל לא תקינה" });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: "הקוד צריך להיות 4 עד 8 ספרות" });
  try {
    const sql = await db();
    const [acc] = await sql`select pin_hash, locked_until from accounts where email = ${email}`;
    if (!acc) {
      const rows = await sql`insert into accounts (email, pin_hash) values (${email}, ${await hashPin(pin)}) on conflict do nothing returning email`;
      if (!rows.length) return res.status(409).json({ error: "נסה שוב" });
    } else {
      if (acc.locked_until && new Date(acc.locked_until) > new Date()) return res.status(429).json({ error: "יותר מדי ניסיונות. נסה שוב בעוד רבע שעה." });
      if (!(await checkPin(pin, acc.pin_hash))) {
        // Every MAX_FAILS wrong PINs lock the address for 15 minutes.
        await sql`update accounts
          set failed = case when failed + 1 >= ${MAX_FAILS} then 0 else failed + 1 end,
              locked_until = case when failed + 1 >= ${MAX_FAILS} then now() + interval '15 minutes' else locked_until end
          where email = ${email}`;
        return res.status(401).json({ error: "הקוד לא נכון למייל הזה" });
      }
      await sql`update accounts set failed = 0 where email = ${email} and failed > 0`;
    }
    res.setHeader("Set-Cookie", await sessionCookie(PIN_PREFIX + email, name));
    res.status(200).json({ ok: true, created: !acc });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
