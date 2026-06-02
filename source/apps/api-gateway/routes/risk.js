const { Router } = require("express");
const risk = require("@global-logistics/risk-engine");
const { requireRole } = require("@global-logistics/auth");

const router = Router();

router.get("/", (req, res) => {
  res.json(risk.assessAll());
});

router.get("/trending", (req, res) => {
  res.json(risk.trending());
});

router.get("/:shipmentId", (req, res) => {
  const result = risk.assessOne(req.params.shipmentId);
  if (!result) return res.status(404).json({ error: "Shipment not found" });
  res.json(result);
});

module.exports = router;
