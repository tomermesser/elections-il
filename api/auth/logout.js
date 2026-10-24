import { logout } from "../../lib/auth.js";
export default function handler(req, res) { logout(res); }
