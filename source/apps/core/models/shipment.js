const { getDb, events } = require("../db");
const crypto = require("crypto");

function generateId(prefix) {
  return prefix + "_" + crypto.randomBytes(8).toString("hex");
}

function buildWhere(filters) {
  let sql = " WHERE 1=1";
  const params = [];
  if (filters.status) { sql += " AND status = ?"; params.push(filters.status); }
  if (filters.origin) { sql += " AND origin = ?"; params.push(filters.origin); }
  if (filters.destination) { sql += " AND destination = ?"; params.push(filters.destination); }
  return { clause: sql, params };
}

const all = (filters = {}) => {
  const db = getDb();
  const { clause, params } = buildWhere(filters);
  let sql = "SELECT * FROM shipments" + clause + " ORDER BY created_at DESC";
  if (filters.limit) { sql += " LIMIT ?"; params.push(filters.limit); }
  if (filters.offset) { sql += " OFFSET ?"; params.push(filters.offset); }
  return db.prepare(sql).all(...params);
};

const count = (filters = {}) => {
  const db = getDb();
  const { clause, params } = buildWhere(filters);
  return db.prepare("SELECT COUNT(*) as total FROM shipments" + clause).get(...params).total;
};

const getById = (id) => {
  return getDb().prepare("SELECT * FROM shipments WHERE id = ?").get(id);
};

const getByReference = (ref) => {
  return getDb().prepare("SELECT * FROM shipments WHERE reference = ?").get(ref);
};

const create = (data) => {
  const db = getDb();
  const id = generateId("shp");
  const ref = data.reference || ("GLM-" + Date.now().toString(36).toUpperCase());
  const stmt = db.prepare(`INSERT INTO shipments (id, reference, origin, destination, status,
    cargo_description, cargo_value, cargo_currency, weight_kg, volume_m3,
    shipper_name, shipper_country, consignee_name, consignee_country,
    vessel_name, vessel_imo, port_of_loading, port_of_discharge,
    estimated_departure, estimated_arrival) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  stmt.run(id, ref, data.origin, data.destination, data.status || "pending",
    data.cargo_description, data.cargo_value, data.cargo_currency || "USD",
    data.weight_kg, data.volume_m3, data.shipper_name, data.shipper_country,
    data.consignee_name, data.consignee_country, data.vessel_name, data.vessel_imo,
    data.port_of_loading, data.port_of_discharge, data.estimated_departure, data.estimated_arrival);
  const created = getById(id);
  events.emit("shipment:updated", created);
  return created;
};

const updateStatus = (id, status, extras = {}) => {
  const db = getDb();
  const fields = ["status = ?", "updated_at = datetime('now')"];
  const params = [status];
  for (const [k, v] of Object.entries(extras)) {
    if (["actual_departure", "actual_arrival"].includes(k)) {
      fields.push(`${k} = ?`);
      params.push(v);
    }
  }
  params.push(id);
  db.prepare(`UPDATE shipments SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  const updated = getById(id);
  events.emit("shipment:updated", updated);
  return updated;
};

module.exports = { all, count, getById, getByReference, create, updateStatus };
