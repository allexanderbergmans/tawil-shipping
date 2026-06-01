const { Router } = require("express");
const auth = require("@global-logistics/auth");
const Joi = require("joi");

const router = Router();

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid("operator", "viewer").optional(),
});

router.post("/login", (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = auth.login(value.username, value.password, req.ip);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });
  res.json(result);
});

router.post("/register", (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });
  const result = auth.register(value, req.ip);
  if (result.error) return res.status(409).json({ error: result.error });
  res.status(201).json(result);
});

router.get("/me", auth.middleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
