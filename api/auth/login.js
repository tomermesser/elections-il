import { startLogin } from "../../lib/auth.js";
export default function handler(req, res) { startLogin(req, res); }
