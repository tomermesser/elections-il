// Serves the page for invite links (/?join=CODE, rewritten here by vercel.json) with link-preview
// tags that name the group, so WhatsApp & co. show "הוזמנת לקבוצת ...". The page itself is unchanged:
// its script reads ?join= and completes the join after sign-in.
import { db } from "../lib/db.js";
import { baseUrl } from "../lib/auth.js";

const attr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async function handler(req, res) {
  const base = baseUrl(req);
  let html;
  try {
    const r = await fetch(`${base}/index.html`);
    if (!r.ok) throw new Error(`index ${r.status}`);
    html = await r.text();
  } catch (e) {
    console.error(e);
    res.writeHead(302, { Location: "/" });
    return res.end();
  }

  const code = String(req.query?.join ?? new URL(req.url, base).searchParams.get("join") ?? "").trim().toLowerCase();
  let group = null;
  if (/^[a-z0-9]{6,20}$/.test(code)) {
    try {
      const sql = await db();
      [group] = await sql`select g.name, (select count(*)::int from memberships m where m.group_id = g.id) as members
                          from groups g where g.code = ${code}`;
    } catch (e) {
      console.error(e);
    }
  }

  if (group) {
    const title = `הוזמנת לקבוצת "${group.name}"`;
    const desc = `${group.members} ${group.members === 1 ? "חבר כבר בקבוצה" : "חברים כבר בקבוצה"}. הצטרפו, נחשו כמה מנדטים כל מפלגה תקבל, ותראו מי צדק. ההימורים ננעלים ביום שלישי 27.10 ב-08:00.`;
    const block = `<!--og-->
<title>${attr(title)} · הימורי בחירות 2026</title>
<meta name="description" content="${attr(desc)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="הימורי בחירות 2026">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(desc)}">
<meta property="og:url" content="${attr(`${base}/?join=${code}`)}">
<meta property="og:image" content="${attr(`${base}/og.png`)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<!--/og-->`;
    html = html.replace(/<!--og-->[\s\S]*?<!--\/og-->/, block);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60");
  res.status(200).send(html);
}
