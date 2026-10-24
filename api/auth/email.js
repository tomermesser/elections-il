// Name + PIN sign-in. (Path kept from the earlier email + PIN version.)
// Accounts created by the old email flow keep their key, so their picks stay theirs:
// they now sign in with the name on their pick and the same PIN.
import { db, nameOwner } from "../../lib/db.js";
import { sameOriginJson, sessionCookie, hashPin, checkPin, PIN_PREFIX } from "../../lib/auth.js";
import { cleanName } from "../../lib/game.js";

const MAX_FAILS = 5;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const body = req.body || {};
  const name = cleanName(body.name);
  const pin = String(body.pin ?? "");
  if (!name) return res.status(400).json({ error: "צריך למלא שם" });
  if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: "הקוד צריך להיות 4 עד 8 ספרות" });
  try {
    const sql = await db();
    const owner = await nameOwner(sql, name);
    if (owner?.kind === "google") {
      return res.status(409).json({ error: "השם הזה כבר תפוס על ידי משתתף שהתחבר עם Google. אם זה אתה, התחבר עם Google. אם לא, בחר שם אחר." });
    }

    if (!owner) {
      // New player: the name is free, so it becomes theirs with this PIN.
      const key = "n:" + name.toLowerCase();
      let rows;
      try {
        rows = await sql`insert into accounts (email, pin_hash, display_name) values (${key}, ${await hashPin(pin)}, ${name})
                         on conflict do nothing returning email`;
      } catch (e) {
        if (e?.code === "23505") rows = [];
        else throw e;
      }
      if (!rows.length) return res.status(409).json({ error: "השם הזה נתפס הרגע. נסה שוב או בחר שם אחר." });
      res.setHeader("Set-Cookie", await sessionCookie(PIN_PREFIX + key, name));
      return res.status(200).json({ ok: true, created: true });
    }

    // Existing name: only its PIN gets in.
    const [acc] = await sql`select pin_hash, locked_until, display_name from accounts where email = ${owner.key}`;
    if (!acc) return res.status(409).json({ error: "השם הזה כבר תפוס. בחר שם אחר." });
    if (acc.locked_until && new Date(acc.locked_until) > new Date()) return res.status(429).json({ error: "יותר מדי ניסיונות לשם הזה. נסה שוב בעוד רבע שעה." });
    if (!(await checkPin(pin, acc.pin_hash))) {
      await sql`update accounts
        set failed = case when failed + 1 >= ${MAX_FAILS} then 0 else failed + 1 end,
            locked_until = case when failed + 1 >= ${MAX_FAILS} then now() + interval '15 minutes' else locked_until end
        where email = ${owner.key}`;
      return res.status(401).json({ error: "השם הזה כבר רשום עם קוד אחר. אם זה אתה, בדוק את הקוד. אם לא, בחר שם אחר." });
    }
    await sql`update accounts set failed = 0 where email = ${owner.key} and failed > 0`;
    if (!acc.display_name) {
      // An account from the email flow: pin its name now, so nobody else can take it.
      try { await sql`update accounts set display_name = ${name} where email = ${owner.key} and display_name is null`; } catch {}
    }
    res.setHeader("Set-Cookie", await sessionCookie(PIN_PREFIX + owner.key, acc.display_name || name));
    res.status(200).json({ ok: true, created: false });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
