const { Router } = require("express");
const auth = require("@global-logistics/auth");
const { getDb } = require("@global-logistics/core/db");
const { shipment } = require("@global-logistics/core/models");

const router = Router();
router.use(auth.middleware);

function parseFields(raw, defaults) {
  if (!raw) return defaults;
  return raw.split(",").filter(f => defaults.includes(f));
}

function parseIds(raw) {
  if (!raw) return null;
  return raw.split(",").filter(Boolean);
}

router.get("/shipments/csv", (req, res) => {
  const allFields = ["reference", "origin", "destination", "status", "cargo_description", "cargo_value",
    "weight_kg", "volume_m3", "shipper_name", "shipper_country", "consignee_name", "consignee_country",
    "port_of_loading", "port_of_discharge", "estimated_departure", "estimated_arrival", "created_at", "updated_at"];
  const fields = parseFields(req.query.fields, allFields);
  const ids = parseIds(req.query.ids);
  let shipments;
  if (ids) {
    const db = getDb();
    const placeholders = ids.map(() => "?").join(",");
    shipments = db.prepare(`SELECT * FROM shipments WHERE id IN (${placeholders})`).all(...ids);
  } else {
    shipments = shipment.all(req.query);
  }
  const csv = [fields.join(",")];
  for (const s of shipments) {
    csv.push(fields.map(h => {
      const val = s[h] !== null && s[h] !== undefined ? s[h] : "";
      return String(val).includes(",") || String(val).includes('"') ? `"${String(val).replace(/"/g, '""')}"` : val;
    }).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=shipments.csv");
  res.send(csv.join("\n"));
});

router.get("/shipments/json", (req, res) => {
  const allFields = ["reference", "origin", "destination", "status", "cargo_description", "cargo_value",
    "weight_kg", "volume_m3", "shipper_name", "shipper_country", "consignee_name", "consignee_country",
    "port_of_loading", "port_of_discharge", "estimated_departure", "estimated_arrival", "created_at", "updated_at"];
  const fields = parseFields(req.query.fields, allFields);
  const ids = parseIds(req.query.ids);
  let shipments;
  if (ids) {
    const db = getDb();
    const placeholders = ids.map(() => "?").join(",");
    shipments = db.prepare(`SELECT * FROM shipments WHERE id IN (${placeholders})`).all(...ids);
  } else {
    shipments = shipment.all(req.query);
  }
  if (fields.length < allFields.length) {
    shipments = shipments.map(s => {
      const row = {};
      for (const f of fields) row[f] = s[f];
      return row;
    });
  }
  res.setHeader("Content-Disposition", "attachment; filename=shipments.json");
  res.json(shipments);
});

router.get("/compliance/csv", (req, res) => {
  const db = getDb();
  const checks = db.prepare(`SELECT cc.*, cr.type as rule_type, cr.description as rule_description
    FROM compliance_checks cc JOIN compliance_rules cr ON cc.rule_id = cr.id
    ORDER BY cc.checked_at DESC`).all();
  const headers = ["shipment_id", "result", "rule_type", "rule_description", "details", "checked_at"];
  const csv = [headers.join(",")];
  for (const c of checks) {
    csv.push(headers.map(h => {
      const val = c[h] || "";
      return String(val).includes(",") || String(val).includes('"') ? `"${String(val).replace(/"/g, '""')}"` : val;
    }).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=compliance.csv");
  res.send(csv.join("\n"));
});

module.exports = router;
