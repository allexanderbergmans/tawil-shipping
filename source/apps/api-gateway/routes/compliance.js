const { Router } = require("express");
const auth = require("@global-logistics/auth");
const compliance = require("@global-logistics/compliance-engine");
const { getDb } = require("@global-logistics/core/db");
const Joi = require("joi");
const crypto = require("crypto");

const router = Router();
router.use(auth.middleware);

router.post("/check/:shipmentId", auth.authorize(["admin", "operator"]), (req, res) => {
  const result = compliance.runChecks(req.params.shipmentId);
  res.json(result);
});

router.get("/results/:shipmentId", (req, res) => {
  const results = compliance.getResults(req.params.shipmentId);
  res.json(results);
});

router.get("/rules", (req, res) => {
  const db = getDb();
  let sql = "SELECT * FROM compliance_rules WHERE 1=1";
  const params = [];
  if (req.query.type) { sql += " AND type = ?"; params.push(req.query.type); }
  if (req.query.active === "true") { sql += " AND is_active = 1"; }
  sql += " ORDER BY type, country";
  res.json(db.prepare(sql).all(...params));
});

router.post("/rules", auth.authorize(["admin"]), (req, res) => {
  const schema = Joi.object({
    type: Joi.string().valid("sanctions", "embargo", "customs", "restricted_party").required(),
    country: Joi.string().optional().allow(null, ""),
    pattern: Joi.string().optional().allow(null, ""),
    min_value: Joi.number().optional().allow(null),
    max_value: Joi.number().optional().allow(null),
    action: Joi.string().valid("block", "flag", "warn").default("flag"),
    description: Joi.string().required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const db = getDb();
  const id = "cr_" + crypto.randomBytes(6).toString("hex");
  db.prepare("INSERT INTO compliance_rules (id, type, country, pattern, min_value, max_value, action, description) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, value.type, value.country || null, value.pattern || null, value.min_value || null, value.max_value || null, value.action, value.description);
  res.status(201).json(db.prepare("SELECT * FROM compliance_rules WHERE id = ?").get(id));
});

router.put("/rules/:id", auth.authorize(["admin"]), (req, res) => {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM compliance_rules WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Rule not found" });
  const schema = Joi.object({
    type: Joi.string().valid("sanctions", "embargo", "customs", "restricted_party"),
    country: Joi.string().optional().allow(null, ""),
    pattern: Joi.string().optional().allow(null, ""),
    min_value: Joi.number().optional().allow(null),
    max_value: Joi.number().optional().allow(null),
    action: Joi.string().valid("block", "flag", "warn"),
    description: Joi.string(),
    is_active: Joi.boolean(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const fields = []; const params = [];
  for (const k of ["type", "country", "pattern", "min_value", "max_value", "action", "description"]) {
    if (value[k] !== undefined) { fields.push(`${k} = ?`); params.push(value[k] || null); }
  }
  if (value.is_active !== undefined) { fields.push("is_active = ?"); params.push(value.is_active ? 1 : 0); }
  if (fields.length === 0) return res.json(existing);
  fields.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.prepare(`UPDATE compliance_rules SET ${fields.join(", ")} WHERE id = ?`).run(...params);
  res.json(db.prepare("SELECT * FROM compliance_rules WHERE id = ?").get(req.params.id));
});

router.delete("/rules/:id", auth.authorize(["admin"]), (req, res) => {
  getDb().prepare("DELETE FROM compliance_rules WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/approve/:shipmentId", auth.authorize(["admin", "operator"]), (req, res) => {
  const db = getDb();
  const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(req.params.shipmentId);
  if (!s) return res.status(404).json({ error: "Shipment not found" });
  const id = "cap_" + crypto.randomBytes(8).toString("hex");
  db.prepare("INSERT INTO compliance_approvals (id, shipment_id, approved_by, status, notes) VALUES (?,?,?,?,?)")
    .run(id, req.params.shipmentId, req.user.id, req.body.status || "approved", req.body.notes || null);
  if (req.body.status === "approved") {
    db.prepare("UPDATE shipments SET status = 'cleared', updated_at = datetime('now') WHERE id = ?").run(req.params.shipmentId);
  }
  res.status(201).json(db.prepare("SELECT * FROM compliance_approvals WHERE id = ?").get(id));
});

module.exports = router;
