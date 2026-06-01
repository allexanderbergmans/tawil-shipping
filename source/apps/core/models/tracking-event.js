const { getDb, events } = require("../db");
const crypto = require("crypto");

const byShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp DESC").all(shipmentId);
};

const create = (data) => {
  const db = getDb();
  const id = "trk_" + crypto.randomBytes(8).toString("hex");
  db.prepare(`INSERT INTO tracking_events (id, shipment_id, status, location, location_lat, location_lng, description)
    VALUES (?,?,?,?,?,?,?)`).run(id, data.shipment_id, data.status, data.location,
    data.location_lat, data.location_lng, data.description);
  const event = db.prepare("SELECT * FROM tracking_events WHERE id = ?").get(id);
  events.emit("shipment:tracking", event);
  return event;
};

const latestByShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp DESC LIMIT 1").get(shipmentId);
};

module.exports = { byShipment, create, latestByShipment };
