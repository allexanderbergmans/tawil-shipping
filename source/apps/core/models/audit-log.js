const { getDb } = require("../db");
const crypto = require("crypto");

const create = (data) => {
  const db = getDb();
  const id = "aud_" + crypto.randomBytes(8).toString("hex");
  db.prepare("INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address) VALUES (?,?,?,?,?,?,?)")
    .run(id, data.user_id || null, data.action, data.resource_type || null, data.resource_id || null,
      data.details ? JSON.stringify(data.details) : null, data.ip_address || null);
  return db.prepare("SELECT * FROM audit_logs WHERE id = ?").get(id);
};

const search = (filters = {}) => {
  const db = getDb();
  let sql = "SELECT al.*, u.username FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1";
  const params = [];
  if (filters.action) { sql += " AND al.action = ?"; params.push(filters.action); }
  if (filters.resource_type) { sql += " AND al.resource_type = ?"; params.push(filters.resource_type); }
  if (filters.user_id) { sql += " AND al.user_id = ?"; params.push(filters.user_id); }
  if (filters.days) { sql += " AND al.created_at > datetime('now', ?)"; params.push("-" + filters.days + " days"); }
  sql += " ORDER BY al.created_at DESC";
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  sql += " LIMIT ? OFFSET ?"; params.push(limit, offset);
  return db.prepare(sql).all(...params).map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : null }));
};

module.exports = { create, search };
