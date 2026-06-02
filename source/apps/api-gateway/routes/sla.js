const { Router } = require("express");
const sla = require("@global-logistics/sla-engine");
const { requireRole } = require("@global-logistics/auth");

const router = Router();

router.get("/", (req, res) => {
  const activeOnly = req.query.active === "true";
  res.json(sla.list(activeOnly));
});

router.post("/", (req, res) => {
  try {
    const result = sla.create(req.body);
    res.status(201).json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put("/:id", (req, res) => {
  const result = sla.update(req.params.id, req.body);
  if (!result) return res.status(404).json({ error: "SLA not found" });
  res.json(result);
});

router.delete("/:id", (req, res) => {
  sla.remove(req.params.id);
  res.json({ ok: true });
});

router.get("/check/:shipmentId", (req, res) => {
  const result = sla.checkShipment(req.params.shipmentId);
  if (result === null) return res.status(404).json({ error: "Shipment not found" });
  res.json(result);
});

router.get("/breaches", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(sla.breaches(limit));
});

router.post("/detect", (req, res) => {
  const breaches = sla.detectBreaches();
  res.json({ breaches, count: breaches.length });
});

module.exports = router;
