const { Router } = require("express");
const auth = require("@global-logistics/auth");
const { user, apiKey, auditLog } = require("@global-logistics/core/models");
const Joi = require("joi");

const router = Router();
router.use(auth.middleware);
router.use(auth.authorize(["admin"]));

router.get("/users", (req, res) => {
  res.json(user.all());
});

router.get("/users/:id", (req, res) => {
  const u = user.getById(req.params.id);
  if (!u) return res.status(404).json({ error: "User not found" });
  res.json(u);
});

router.post("/users", (req, res) => {
  const schema = Joi.object({
    username: Joi.string().min(3).max(30).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid("admin", "operator", "viewer").required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const u = user.create(value);
  res.status(201).json(u);
});

router.get("/api-keys", (req, res) => {
  const keys = apiKey.all(req.query.user_id || req.user.id);
  res.json(keys);
});

router.post("/api-keys", (req, res) => {
  const schema = Joi.object({ name: Joi.string().required(), user_id: Joi.string().optional() });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const key = apiKey.create(value.user_id || req.user.id, value.name);
  res.status(201).json(key);
});

router.delete("/api-keys/:id", (req, res) => {
  apiKey.remove(req.params.id);
  res.json({ ok: true });
});

router.get("/audit-log", (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = auditLog.search({ ...req.query, limit });
  res.json(logs);
});

module.exports = router;
