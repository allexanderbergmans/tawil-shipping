const { Router } = require("express");
const auth = require("@global-logistics/auth");
const { getDb } = require("@global-logistics/core/db");
const { shipment } = require("@global-logistics/core/models");

const router = Router();
router.use(auth.middleware);

router.get("/shipments/csv", (req, res) => {
  const shipments = shipment.all(req.query);
  const headers = ["reference", "origin", "destination", "status", "cargo_description", "cargo_value",
    "weight_kg", "shipper_name", "shipper_country", "consignee_name", "consignee_country",
    "port_of_loading", "port_of_discharge", "estimated_departure", "estimated_arrival", "created_at"];
  const csv = [headers.join(",")];
  for (const s of shipments) {
    csv.push(headers.map(h => {
      const val = s[h] || "";
      return String(val).includes(",") ? `"${val}"` : val;
    }).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=shipments.csv");
  res.send(csv.join("\n"));
});

router.get("/shipments/json", (req, res) => {
  const shipments = shipment.all(req.query);
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
      return String(val).includes(",") ? `"${val}"` : val;
    }).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=compliance.csv");
  res.send(csv.join("\n"));
});

module.exports = router;
