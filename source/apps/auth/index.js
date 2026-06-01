const jwt = require("jsonwebtoken");
const { user, apiKey, auditLog } = require("@global-logistics/core/models");

const JWT_SECRET = process.env.JWT_SECRET || "mesh-dev-secret-change-in-production";
const JWT_EXPIRY = "24h";

const roles = { admin: 3, operator: 2, viewer: 1 };

function login(username, password, ip) {
  const u = user.getByUsername(username);
  if (!u || !u.is_active) return null;
  if (!user.verifyPassword(password, u.password_hash)) return null;
  const token = jwt.sign({ sub: u.id, role: u.role, username: u.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  auditLog.create({ user_id: u.id, action: "user.login", details: { username }, ip_address: ip });
  return { token, user: { id: u.id, username: u.username, email: u.email, role: u.role } };
}

function register(data, ip) {
  if (user.getByUsername(data.username)) return { error: "Username already exists" };
  if (user.getByEmail(data.email)) return { error: "Email already exists" };
  const u = user.create(data);
  auditLog.create({ user_id: u.id, action: "user.register", details: { username: data.username }, ip_address: ip });
  const token = jwt.sign({ sub: u.id, role: u.role, username: u.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  return { token, user: u };
}

function authenticate(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const u = user.getById(decoded.sub);
    if (!u || !u.is_active) return null;
    return { id: u.id, username: u.username, role: u.role };
  } catch { return null; }
}

function authorize(allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) return res.status(401).json({ error: "Authentication required" });
    const level = roles[userRole] || 0;
    const required = Math.max(...allowedRoles.map(r => roles[r] || 0));
    if (level < required) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

function middleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    const key = req.headers["x-api-key"];
    if (key) {
      const ak = apiKey.validate(key);
      if (ak) {
        req.user = { id: ak.user_id, role: ak.role, apiKey: true };
        return next();
      }
    }
    req.user = { id: null, role: "viewer", anonymous: true };
    return next();
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  const u = authenticate(token);
  if (!u) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = u;
  next();
}

module.exports = { login, register, authenticate, authorize, middleware, roles, JWT_SECRET };
