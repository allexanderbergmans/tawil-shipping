const { Router } = require("express");
const auth = require("@global-logistics/auth");
const webhookModel = require("@global-logistics/core/models/webhook");
const Joi = require("joi");

const router = Router();
router.use(auth.middleware);
router.use(auth.authorize(["admin", "operator"]));

const whSchema = Joi.object({
  name: Joi.string().required(),
  url: Joi.string().uri().required(),
  events: Joi.array().items(Joi.string()).optional(),
  secret: Joi.string().optional(),
});

router.get("/", (req, res) => {
  const activeOnly = req.query.active === "true";
  res.json(webhookModel.all(activeOnly));
});

router.post("/", (req, res) => {
  const { error, value } = whSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const wh = webhookModel.create(value);
  res.status(201).json(wh);
});

router.get("/:id", (req, res) => {
  const wh = webhookModel.getById(req.params.id);
  if (!wh) return res.status(404).json({ error: "Webhook not found" });
  res.json(wh);
});

router.put("/:id", (req, res) => {
  const { error, value } = whSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const wh = webhookModel.update(req.params.id, value);
  if (!wh) return res.status(404).json({ error: "Webhook not found" });
  res.json(wh);
});

router.patch("/:id", (req, res) => {
  const wh = webhookModel.update(req.params.id, req.body);
  if (!wh) return res.status(404).json({ error: "Webhook not found" });
  res.json(wh);
});

router.delete("/:id", (req, res) => {
  webhookModel.remove(req.params.id);
  res.json({ ok: true });
});

router.get("/:id/deliveries", (req, res) => {
  const deliveries = webhookModel.getDeliveries(req.params.id, parseInt(req.query.limit) || 20);
  res.json(deliveries);
});

module.exports = router;
