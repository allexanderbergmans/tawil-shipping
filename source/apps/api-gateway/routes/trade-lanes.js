const { Router } = require("express");
const lanes = require("@global-logistics/trade-lanes");

const router = Router();

router.get("/", (req, res) => {
  res.json(lanes.all());
});

router.get("/detail", (req, res) => {
  const { origin, destination } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: "origin and destination query params required" });
  res.json(lanes.detail(origin, destination));
});

module.exports = router;
