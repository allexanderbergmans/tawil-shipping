const { getDb, events } = require("../db");
const crypto = require("crypto");

const getRules = (type) => {
  const db = getDb();
  if (type) return db.prepare("SELECT * FROM compliance_rules WHERE type = ? AND is_active = 1").all(type);
  return db.prepare("SELECT * FROM compliance_rules WHERE is_active = 1").all();
};

const checkShipment = (shipmentId, rule) => {
  const db = getDb();
  const id = "chk_" + crypto.randomBytes(8).toString("hex");
  const shipment = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
  if (!shipment) return null;

  let result = "pass";
  let details = "";

  if (rule.type === "sanctions" && rule.country) {
    if (shipment.origin === rule.country || shipment.destination === rule.country ||
        shipment.shipper_country === rule.country || shipment.consignee_country === rule.country) {
      result = rule.action === "block" ? "fail" : "flag";
      details = `Shipment involves ${rule.country} — ${rule.description}`;
    }
  }

  if (rule.type === "embargo" && rule.country) {
    if (shipment.origin === rule.country || shipment.destination === rule.country) {
      result = rule.action === "block" ? "fail" : "flag";
      details = `Shipment involves embargoed country ${rule.country} — ${rule.description}`;
    }
  }

  if (rule.type === "customs") {
    if (shipment.cargo_value && shipment.cargo_value > 50000) {
      result = "flag";
      details = `High-value shipment ($${shipment.cargo_value}) flagged — ${rule.description}`;
    }
  }

  if (rule.type === "restricted_party") {
    if (shipment.cargo_description && shipment.cargo_description.toLowerCase().includes("chemical")) {
      result = "flag";
      details = `Dual-use goods detected — ${rule.description}`;
    }
  }

  const check = db.prepare(`INSERT INTO compliance_checks (id, shipment_id, rule_id, result, details) VALUES (?,?,?,?,?)`);
  check.run(id, shipmentId, rule.id, result, details);
  const saved = db.prepare("SELECT * FROM compliance_checks WHERE id = ?").get(id);

  if (result !== "pass") {
    events.emit("compliance:alert", { shipmentId, rule, result, details });
  }
  return saved;
};

const checkAllRules = (shipmentId) => {
  const rules = getRules();
  return rules.map(rule => checkShipment(shipmentId, rule));
};

const resultsByShipment = (shipmentId) => {
  return getDb().prepare(`SELECT cc.*, cr.type as rule_type, cr.description as rule_description
    FROM compliance_checks cc JOIN compliance_rules cr ON cc.rule_id = cr.id
    WHERE cc.shipment_id = ? ORDER BY cc.checked_at DESC`).all(shipmentId);
};

module.exports = { getRules, checkShipment, checkAllRules, resultsByShipment };
