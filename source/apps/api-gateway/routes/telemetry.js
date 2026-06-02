const { Router } = require("express");
const telemetry = require("@global-logistics/telemetry");

const router = Router();

router.get("/alerts", (req, res) => {
  res.json(telemetry.activeAlerts());
});

router.get("/:shipmentId", (req, res) => {
  const data = telemetry.latest(req.params.shipmentId);
  if (!data) return res.json({ shipment_id: req.params.shipmentId, sensor_data: null, message: "No telemetry yet" });
  res.json(data);
});

router.get("/:shipmentId/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(telemetry.history(req.params.shipmentId, limit));
});

router.get("/:shipmentId/alerts", (req, res) => {
  const all = req.query.all === "true";
  res.json(telemetry.alerts(req.params.shipmentId, !all));
});

router.post("/:shipmentId/generate", (req, res) => {
  const count = parseInt(req.query.count) || 3;
  const results = telemetry.generate(req.params.shipmentId, count);
  res.status(201).json({ generated: results.length, readings: results });
});

router.post("/alerts/:alertId/resolve", (req, res) => {
  telemetry.resolveAlert(req.params.alertId);
  res.json({ ok: true });
});

module.exports = router;
