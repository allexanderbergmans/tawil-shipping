const { getDb } = require("../db");
const crypto = require("crypto");

const all = (unreadOnly = false) => {
  const db = getDb();
  if (unreadOnly) return db.prepare("SELECT * FROM notifications WHERE is_read = 0 ORDER BY created_at DESC").all();
  return db.prepare("SELECT * FROM notifications ORDER BY created_at DESC").all();
};

const byShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM notifications WHERE shipment_id = ? ORDER BY created_at DESC").all(shipmentId);
};

const create = (data) => {
  const db = getDb();
  const id = "ntf_" + crypto.randomBytes(8).toString("hex");
  db.prepare(`INSERT INTO notifications (id, type, shipment_id, recipient, subject, body)
    VALUES (?,?,?,?,?,?)`).run(id, data.type, data.shipment_id, data.recipient,
    data.subject, data.body);
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id);
};

const markRead = (id) => {
  getDb().prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(id);
  return getDb().prepare("SELECT * FROM notifications WHERE id = ?").get(id);
};

const markAllRead = () => {
  getDb().prepare("UPDATE notifications SET is_read = 1 WHERE is_read = 0").run();
};

module.exports = { all, byShipment, create, markRead, markAllRead };
