const { getDb, events } = require("../db");
const crypto = require("crypto");

const all = (activeOnly = false) => {
  const db = getDb();
  const sql = activeOnly ? "SELECT * FROM webhooks WHERE is_active = 1 ORDER BY created_at DESC" : "SELECT * FROM webhooks ORDER BY created_at DESC";
  return db.prepare(sql).all().map(w => ({ ...w, events: JSON.parse(w.events) }));
};

const getById = (id) => {
  const w = getDb().prepare("SELECT * FROM webhooks WHERE id = ?").get(id);
  if (w) w.events = JSON.parse(w.events);
  return w;
};

const create = (data) => {
  const db = getDb();
  const id = "whk_" + crypto.randomBytes(8).toString("hex");
  db.prepare("INSERT INTO webhooks (id, name, url, events, secret) VALUES (?,?,?,?,?)")
    .run(id, data.name, data.url, JSON.stringify(data.events || []), data.secret || null);
  return getById(id);
};

const update = (id, data) => {
  const db = getDb();
  const fields = []; const params = [];
  if (data.name !== undefined) { fields.push("name = ?"); params.push(data.name); }
  if (data.url !== undefined) { fields.push("url = ?"); params.push(data.url); }
  if (data.events !== undefined) { fields.push("events = ?"); params.push(JSON.stringify(data.events)); }
  if (data.is_active !== undefined) { fields.push("is_active = ?"); params.push(data.is_active ? 1 : 0); }
  if (fields.length === 0) return getById(id);
  fields.push("updated_at = datetime('now')");
  params.push(id);
  db.prepare(`UPDATE webhooks SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  return getById(id);
};

const remove = (id) => {
  getDb().prepare("DELETE FROM webhooks WHERE id = ?").run(id);
};

const recordDelivery = (webhookId, eventType, payload, status, responseCode, responseBody) => {
  const db = getDb();
  const id = "whd_" + crypto.randomBytes(8).toString("hex");
  db.prepare("INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, status, response_code, response_body) VALUES (?,?,?,?,?,?,?)")
    .run(id, webhookId, eventType, JSON.stringify(payload), status, responseCode || null, responseBody || null);
  if (status === "success") {
    db.prepare("UPDATE webhooks SET last_triggered_at = datetime('now'), failure_count = 0 WHERE id = ?").run(webhookId);
  } else {
    db.prepare("UPDATE webhooks SET failure_count = failure_count + 1 WHERE id = ?").run(webhookId);
  }
  return id;
};

const getDeliveries = (webhookId, limit = 20) => {
  return getDb().prepare("SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?").all(webhookId, limit);
};

module.exports = { all, getById, create, update, remove, recordDelivery, getDeliveries };
