const { getDb, events } = require("../db");
const crypto = require("crypto");

const byShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM documents WHERE shipment_id = ? ORDER BY created_at DESC").all(shipmentId);
};

const getById = (id) => {
  return getDb().prepare("SELECT * FROM documents WHERE id = ?").get(id);
};

const create = (data) => {
  const db = getDb();
  const id = "doc_" + crypto.randomBytes(8).toString("hex");
  db.prepare(`INSERT INTO documents (id, shipment_id, type, title, source_content, compiled_content, format)
    VALUES (?,?,?,?,?,?,?)`).run(id, data.shipment_id, data.type, data.title,
    data.source_content, data.compiled_content, data.format || "html");
  const saved = getById(id);
  events.emit("document:created", saved);
  return saved;
};

module.exports = { byShipment, getById, create };
