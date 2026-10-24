import { db, settings } from "../lib/db.js";
import { currentUser, isAdmin, sameOriginJson } from "../lib/auth.js";
import { config, parseResults } from "../lib/game.js";

const pts = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null; };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const user = await currentUser(req);
  if (!user || !isAdmin(user.email)) return res.status(403).json({ error: "רק המארגן יכול לעשות את זה" });
  const body = req.body || {};
  try {
    const sql = await db();
    const s = await settings(sql);
    const c = config(s.config);

    if (body.action === "settings") {
      if (s.locked_at) return res.status(423).json({ error: "אחרי הנעילה אי אפשר לשנות הגדרות" });
      const next = { ...c };
      next.title = String(body.title ?? c.title).trim().slice(0, 60) || c.title;
      for (const k of ["exact", "near", "blocExact", "blocNear", "turnPts", "turnBonus"]) {
        if (body[k] === undefined) continue;
        const v = pts(body[k]);
        if (v === null) return res.status(400).json({ error: "ניקוד חייב להיות מספר שלם בין 0 ל-100" });
        next[k] = v;
      }
      if (body.deadline !== undefined) {
        if (body.deadline === null || body.deadline === "") next.deadline = null;
        else {
          const d = new Date(body.deadline);
          if (isNaN(d)) return res.status(400).json({ error: "מועד נעילה לא תקין" });
          if (d <= new Date()) return res.status(400).json({ error: "מועד הנעילה חייב להיות בעתיד" });
          next.deadline = d.toISOString();
        }
      }
      if (body.parties !== undefined) {
        const list = [...new Set((Array.isArray(body.parties) ? body.parties : []).map((p) => String(p).trim().slice(0, 60)).filter(Boolean))];
        const changed = JSON.stringify(list) !== JSON.stringify(c.parties);
        if (changed) {
          const [{ n }] = await sql`select count(*)::int as n from picks`;
          if (n > 0) return res.status(409).json({ error: "אי אפשר לשנות מפלגות אחרי שמישהו הגיש" });
          if (list.length < 2 || list.length > 40) return res.status(400).json({ error: "צריך בין 2 ל-40 מפלגות" });
          next.parties = list;
        }
      }
      const rows = await sql`update settings set config = ${JSON.stringify(next)}::jsonb where id = 1 and locked_at is null returning id`;
      if (!rows.length) return res.status(423).json({ error: "אחרי הנעילה אי אפשר לשנות הגדרות" });
      return res.status(200).json({ ok: true });
    }

    if (body.action === "lock") {
      await sql`update settings set locked_at = now() where id = 1 and locked_at is null`;
      return res.status(200).json({ ok: true });
    }

    if (body.action === "results") {
      if (!s.locked_at) return res.status(409).json({ error: "קודם צריך לנעול את ההימורים" });
      const { results, error } = parseResults(body.results, c.parties);
      if (error) return res.status(400).json({ error });
      await sql`update settings set results = ${JSON.stringify(results)}::jsonb where id = 1`;
      return res.status(200).json({ ok: true });
    }

    if (body.action === "clearResults") {
      await sql`update settings set results = null where id = 1`;
      return res.status(200).json({ ok: true });
    }

    res.status(400).json({ error: "פעולה לא מוכרת" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
