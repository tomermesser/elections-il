import { finishLogin } from "../../lib/auth.js";
export default async function handler(req, res) {
  try { await finishLogin(req, res); }
  catch (e) { console.error(e); res.writeHead(302, { Location: "/?login_error=server" }); res.end(); }
}
