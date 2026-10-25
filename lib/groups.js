import { randomInt, createHmac } from "node:crypto";

/** An opaque, stable handle for a member inside a group, so the page never sees emails or account keys. */
export const memberRef = (groupId, member) =>
  createHmac("sha256", process.env.SESSION_SECRET || "").update(`${groupId}\n${member}`).digest("base64url").slice(0, 16);

// Invite codes: 10 characters without look-alikes (no 0/o, 1/l/i).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const newCode = (n = 10) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
export const newGroupId = () => "g_" + newCode(12);
export const cleanGroupName = (s) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

/** The groups a player belongs to, oldest membership first. */
export async function myGroups(sql, member) {
  if (!member) return [];
  return sql`
    select g.id, g.name, g.code, m.role,
           (select count(*)::int from memberships x where x.group_id = g.id) as members
    from memberships m join groups g on g.id = m.group_id
    where m.member = ${member}
    order by m.joined_at, g.created_at`;
}
