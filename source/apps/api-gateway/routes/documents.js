const { Router } = require("express");
const auth = require("@global-logistics/auth");
const docEngine = require("@global-logistics/documentation-engine");
const { document } = require("@global-logistics/core/models");
const { getDb } = require("@global-logistics/core/db");
const Joi = require("joi");
const crypto = require("crypto");

const router = Router();
router.use(auth.middleware);

router.post("/compile", (req, res) => {
  const schema = Joi.object({ source: Joi.string().required(), format: Joi.string().valid("html", "markdown").default("html") });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  res.json(docEngine.compile(value.source, value.format));
});

router.post("/", auth.authorize(["admin", "operator"]), (req, res) => {
  const schema = Joi.object({
    shipment_id: Joi.string().required(),
    type: Joi.string().required(),
    title: Joi.string().optional(),
    source: Joi.string().required(),
    format: Joi.string().valid("html", "markdown").default("html"),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const doc = docEngine.compileAndSave(value.shipment_id, value.type, value.title, value.source, value.format);
  res.status(201).json(doc);
});

router.get("/shipment/:shipmentId", (req, res) => {
  const docs = document.byShipment(req.params.shipmentId);
  res.json(docs);
});

router.get("/:id", (req, res) => {
  const doc = document.getById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Document not found" });
  res.json(doc);
});

router.get("/templates/all", (req, res) => {
  const db = getDb();
  res.json(db.prepare("SELECT * FROM document_templates ORDER BY name").all());
});

router.post("/templates", auth.authorize(["admin"]), (req, res) => {
  const schema = Joi.object({
    name: Joi.string().required(),
    type: Joi.string().required(),
    content: Joi.string().required(),
    variables: Joi.array().items(Joi.string()).default([]),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const db = getDb();
  const id = "tpl_" + crypto.randomBytes(6).toString("hex");
  db.prepare("INSERT INTO document_templates (id, name, type, content, variables) VALUES (?,?,?,?,?)")
    .run(id, value.name, value.type, value.content, JSON.stringify(value.variables));
  res.status(201).json(db.prepare("SELECT * FROM document_templates WHERE id = ?").get(id));
});

module.exports = router;
