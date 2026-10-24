import { db } from "../lib/db.js";
import { currentUser, isAdmin, sameOriginJson } from "../lib/auth.js";
import { newCode, newGroupId, cleanGroupName } from "../lib/groups.js";

const MAX_CREATED = 20;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!sameOriginJson(req)) return res.status(403).json({ error: "בקשה נחסמה" });
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: "צריך להתחבר" });
  const body = req.body || {};
  try {
    const sql = await db();

    if (body.action === "create") {
      const name = cleanGroupName(body.name);
      if (name.length < 2) return res.status(400).json({ error: "צריך שם קבוצה של לפחות 2 תווים" });
      const [{ n }] = await sql`select count(*)::int as n from groups where created_by = ${user.email}`;
      if (n >= MAX_CREATED) return res.status(429).json({ error: "פתחת כבר הרבה קבוצות" });
      const id = newGroupId();
      await sql`insert into groups (id, name, code, created_by) values (${id}, ${name}, ${newCode()}, ${user.email})`;
      await sql`insert into memberships (group_id, member, role) values (${id}, ${user.email}, 'admin')`;
      return res.status(200).json({ ok: true, groupId: id });
    }

    if (body.action === "join") {
      const code = String(body.code ?? "").trim().toLowerCase();
      if (!/^[a-z0-9]{6,20}$/.test(code)) return res.status(400).json({ error: "לינק ההזמנה לא תקין" });
      const [g] = await sql`select id, name from groups where code = ${code}`;
      if (!g) return res.status(404).json({ error: "לינק ההזמנה לא תקף. בקש לינק חדש ממי שהזמין אותך." });
      await sql`insert into memberships (group_id, member) values (${g.id}, ${user.email}) on conflict do nothing`;
      return res.status(200).json({ ok: true, groupId: g.id, name: g.name });
    }

    const groupId = String(body.groupId ?? "");
    const [m] = await sql`select role from memberships where group_id = ${groupId} and member = ${user.email}`;
    if (!m) return res.status(404).json({ error: "הקבוצה לא נמצאה" });

    if (body.action === "rotate") {
      if (m.role !== "admin" && !isAdmin(user.email)) return res.status(403).json({ error: "רק מי שפתח את הקבוצה יכול להחליף את הלינק" });
      await sql`update groups set code = ${newCode()} where id = ${groupId}`;
      return res.status(200).json({ ok: true });
    }

    if (body.action === "leave") {
      await sql`delete from memberships where group_id = ${groupId} and member = ${user.email}`;
      return res.status(200).json({ ok: true });
    }

    res.status(400).json({ error: "פעולה לא מוכרת" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "שגיאת שרת" });
  }
}
