const { getDb, events } = require("../db");
const crypto = require("crypto");

const byShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp DESC").all(shipmentId);
};

const create = (data) => {
  const db = getDb();
  const id = "trk_" + crypto.randomBytes(8).toString("hex");
  const timestamp = data.timestamp || new Date().toISOString().replace("T", " ").slice(0, 19);

  // Chain of custody: link to previous event via hash
  const prev = db.prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp DESC LIMIT 1").get(data.shipment_id);
  const previousHash = prev ? prev.block_hash : "0".repeat(64);
  const blockNumber = prev ? (prev.block_number || 0) + 1 : 1;
  const blockPayload = previousHash + id + data.shipment_id + data.status + (data.location || "") + timestamp;
  const blockHash = crypto.createHash("sha256").update(blockPayload).digest("hex");

  db.prepare(`INSERT INTO tracking_events (id, shipment_id, status, location, location_lat, location_lng, description, timestamp, previous_hash, block_hash, block_number)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, data.shipment_id, data.status, data.location,
    data.location_lat, data.location_lng, data.description, timestamp, previousHash, blockHash, blockNumber);
  const event = db.prepare("SELECT * FROM tracking_events WHERE id = ?").get(id);
  events.emit("shipment:tracking", event);
  return event;
};

const verifyChain = (shipmentId) => {
  const db = getDb();
  const events = db.prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp ASC").all(shipmentId);
  const results = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const expectedPrev = i === 0 ? "0".repeat(64) : events[i - 1].block_hash;
    const prevOk = e.previous_hash === expectedPrev;
    const payload = e.previous_hash + e.id + e.shipment_id + e.status + (e.location || "") + e.timestamp;
    const expectedHash = crypto.createHash("sha256").update(payload).digest("hex");
    const hashOk = e.block_hash === expectedHash;
    results.push({
      id: e.id,
      status: e.status,
      block_number: e.block_number,
      timestamp: e.timestamp,
      previous_hash: e.previous_hash,
      block_hash: e.block_hash,
      valid: prevOk && hashOk,
    });
  }
  return { valid: results.every(r => r.valid), chain: results, length: results.length };
};

const latestByShipment = (shipmentId) => {
  return getDb().prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp DESC LIMIT 1").get(shipmentId);
};

module.exports = { byShipment, create, latestByShipment, verifyChain };
