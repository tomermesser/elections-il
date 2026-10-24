// Israel is on UTC+2 on election day (summer time ends on 25.10).
// Picks close on Tue 27.10.2026 at 08:00 Israel time: from then the server takes no more picks, whatever the admin set.
export const PICKS_CLOSE = process.env.PICKS_CLOSE || "2026-10-27T06:00:00Z";
// Polls close and exit polls air at 22:00 Israel time (shown as a countdown only).
export const POLLS_CLOSE = process.env.POLLS_CLOSE || "2026-10-27T20:00:00Z";

export const BLOCS = ["גוש השינוי", "גוש נתניהו", "מפלגות ערביות"];

export const DEFAULTS = {
  title: "הימורי בחירות 2026",
  parties: [
    "הליכוד", "יחד (בנט ולפיד)", "ישר!", "ישראל ביתנו", "ש״ס", "יהדות התורה",
    "הציונות הדתית", "עוצמה יהודית", "הדמוקרטים", "רע״מ", "הרשימה המשותפת",
    "המילואימניקים והכלכלית (הנדל וזליכה)", "עמך ישראל (וינטר)"
  ],
  exact: 5, near: 2, blocExact: 5, blocNear: 2, turnPts: 3, turnBonus: 2,
  deadline: null
};

export const config = (stored) => {
  const c = { ...DEFAULTS, ...(stored || {}) };
  if (!Array.isArray(c.parties) || !c.parties.length) c.parties = DEFAULTS.parties;
  return c;
};

const isSeat = (v) => Number.isInteger(v) && v >= 0 && v <= 120;
export const cleanName = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 30);

/** Validates and normalizes a pick. Returns {pick} or {error}. */
export function parsePick(body, parties) {
  if (!body || typeof body !== "object") return { error: "בקשה לא תקינה" };
  const name = cleanName(body.name);
  if (!name) return { error: "צריך למלא שם" };
  const inSeats = body.seats && typeof body.seats === "object" ? body.seats : {};
  const inBlocs = body.blocs && typeof body.blocs === "object" ? body.blocs : {};
  if (Object.keys(inSeats).some((k) => !parties.includes(k))) return { error: "מפלגה לא מוכרת" };
  if (Object.keys(inBlocs).some((k) => !BLOCS.includes(k))) return { error: "גוש לא מוכר" };
  const seats = {}, blocs = {};
  for (const p of parties) {
    const v = Number(inSeats[p] ?? 0);
    if (!isSeat(v)) return { error: `מספר מנדטים לא תקין: ${p}` };
    seats[p] = v;
  }
  for (const b of BLOCS) {
    const v = Number(inBlocs[b] ?? 0);
    if (!isSeat(v)) return { error: `גודל גוש לא תקין: ${b}` };
    blocs[b] = v;
  }
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  if (sum(seats) !== 120) return { error: "סך המנדטים חייב להיות 120" };
  if (sum(blocs) !== 120) return { error: "סך הגושים חייב להיות 120" };
  const turnout = Math.round(Number(body.turnout) * 10) / 10;
  if (!Number.isFinite(turnout) || turnout <= 0 || turnout > 100) return { error: "אחוז הצבעה לא תקין" };
  return { pick: { name, seats, blocs, turnout } };
}

export function parseResults(body, parties) {
  const out = { blocs: {} };
  const r = body && typeof body === "object" ? body : {};
  for (const p of parties) {
    if (r[p] === "" || r[p] == null) continue;
    const v = Number(r[p]);
    if (!isSeat(v)) return { error: `תוצאה לא תקינה: ${p}` };
    out[p] = v;
  }
  for (const b of BLOCS) {
    const x = r.blocs?.[b];
    if (x === "" || x == null) continue;
    const v = Number(x);
    if (!isSeat(v)) return { error: `תוצאה לא תקינה: ${b}` };
    out.blocs[b] = v;
  }
  if (r.turnout !== "" && r.turnout != null) {
    const t = Math.round(Number(r.turnout) * 10) / 10;
    if (!Number.isFinite(t) || t <= 0 || t > 100) return { error: "אחוז הצבעה לא תקין" };
    out.turnout = t;
  }
  return { results: out };
}
