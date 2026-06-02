const { getDb } = require("@global-logistics/core/db");
const crypto = require("crypto");

function create(data) {
  const db = getDb();
  const id = "sla_" + crypto.randomBytes(6).toString("hex");
  db.prepare(`INSERT INTO slas (id, name, origin, destination, status, transit_hours,
    penalty_per_hour, penalty_cap, is_active, description, created_at)
    VALUES (?,?,?,?,?,?,?,?,1,?,datetime('now'))`).run(
    id, data.name, data.origin || "", data.destination || "", data.status || "",
    data.transit_hours || 48, data.penalty_per_hour || 0, data.penalty_cap || 0,
    data.description || ""
  );
  return db.prepare("SELECT * FROM slas WHERE id = ?").get(id);
}

function update(id, data) {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM slas WHERE id = ?").get(id);
  if (!existing) return null;
  db.prepare(`UPDATE slas SET name=?,origin=?,destination=?,status=?,transit_hours=?,
    penalty_per_hour=?,penalty_cap=?,is_active=?,description=?,updated_at=datetime('now')
    WHERE id=?`).run(
    data.name || existing.name, data.origin ?? existing.origin,
    data.destination ?? existing.destination, data.status ?? existing.status,
    data.transit_hours ?? existing.transit_hours,
    data.penalty_per_hour ?? existing.penalty_per_hour,
    data.penalty_cap ?? existing.penalty_cap,
    data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active,
    data.description ?? existing.description, id
  );
  return db.prepare("SELECT * FROM slas WHERE id = ?").get(id);
}

function list(activeOnly) {
  const db = getDb();
  if (activeOnly) return db.prepare("SELECT * FROM slas WHERE is_active = 1 ORDER BY name").all();
  return db.prepare("SELECT * FROM slas ORDER BY name").all();
}

function remove(id) {
  getDb().prepare("DELETE FROM slas WHERE id = ?").run(id);
}

function checkShipment(shipmentId) {
  const db = getDb();
  const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
  if (!s) return null;

  const slas = db.prepare(`SELECT * FROM slas WHERE is_active = 1 AND
    (origin = '' OR origin = ?) AND (destination = '' OR destination = ?)
    AND (status = '' OR status = ?)`).all(s.origin, s.destination, s.status);

  const te = db.prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp ASC").all(shipmentId);
  const firstEvent = te[0];
  const lastEvent = te[te.length - 1];
  const results = [];

  for (const sla of slas) {
    let breach = false;
    let elapsedHours = 0;
    let penalty = 0;

    if (firstEvent && lastEvent) {
      const start = new Date(firstEvent.timestamp + "Z").getTime();
      const end = new Date(lastEvent.timestamp + "Z").getTime();
      elapsedHours = (end - start) / 3600000;
      if (elapsedHours > sla.transit_hours) breach = true;
    }

    if (breach && sla.penalty_per_hour > 0) {
      const overHours = Math.ceil(elapsedHours - sla.transit_hours);
      penalty = Math.min(overHours * sla.penalty_per_hour, sla.penalty_cap || Infinity);
    }

    results.push({
      sla_id: sla.id,
      sla_name: sla.name,
      transit_hours: sla.transit_hours,
      elapsed_hours: Math.round(elapsedHours * 10) / 10,
      breach,
      penalty,
      penalty_per_hour: sla.penalty_per_hour,
      penalty_cap: sla.penalty_cap,
    });
  }
  return results;
}

function breaches(limit = 20) {
  const db = getDb();
  return db.prepare(`SELECT b.*, s.reference as shipment_ref FROM sla_breaches b
    JOIN shipments s ON b.shipment_id = s.id
    ORDER BY b.detected_at DESC LIMIT ?`).all(limit);
}

function detectBreaches() {
  const db = getDb();
  const active = db.prepare(`SELECT s.id as shipment_id, sla.id as sla_id, sla.name as sla_name,
    sla.transit_hours, sla.penalty_per_hour, sla.penalty_cap FROM slas sla
    JOIN shipments s ON (sla.origin = '' OR sla.origin = s.origin)
      AND (sla.destination = '' OR sla.destination = s.destination)
      AND (sla.status = '' OR sla.status = s.status)
    WHERE sla.is_active = 1 AND s.status NOT IN ('delivered','cleared')`).all();

  const newBreaches = [];
  for (const row of active) {
    const te = db.prepare("SELECT * FROM tracking_events WHERE shipment_id = ? ORDER BY timestamp ASC").all(row.shipment_id);
    if (te.length < 2) continue;
    const start = new Date(te[0].timestamp + "Z").getTime();
    const end = new Date(te[te.length - 1].timestamp + "Z").getTime();
    const elapsed = (end - start) / 3600000;
    if (elapsed > row.transit_hours) {
      const exists = db.prepare("SELECT id FROM sla_breaches WHERE shipment_id = ? AND sla_id = ?").get(row.shipment_id, row.sla_id);
      if (!exists) {
        const pid = "br_" + crypto.randomBytes(6).toString("hex");
        const overHours = Math.ceil(elapsed - row.transit_hours);
        const penalty = Math.min(overHours * row.penalty_per_hour, row.penalty_cap || Infinity);
        db.prepare(`INSERT INTO sla_breaches (id, shipment_id, sla_id, elapsed_hours, transit_hours, penalty, detected_at)
          VALUES (?,?,?,?,?,?,datetime('now'))`).run(pid, row.shipment_id, row.sla_id, elapsed, row.transit_hours, penalty);
        newBreaches.push({ id: pid, shipment_id: row.shipment_id, sla_name: row.sla_name, penalty });
      }
    }
  }
  return newBreaches;
}

module.exports = { create, update, list, remove, checkShipment, breaches, detectBreaches };
