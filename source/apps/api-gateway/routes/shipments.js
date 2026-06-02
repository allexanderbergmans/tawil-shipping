const { Router } = require("express");
const tracker = require("@global-logistics/shipment-tracker");

const router = Router();

router.get("/", (req, res) => {
  const { status, origin, destination } = req.query;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const filters = { status, origin, destination };
  const data = tracker.listShipments({ ...filters, limit, offset });
  const total = tracker.countShipments(filters);
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.ceil(total / limit) || 1;
  res.json({ data, total, page, pages, limit, offset });
});

router.post("/", (req, res) => {
  try {
    const s = tracker.createShipment(req.body);
    res.status(201).json(s);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get("/:id", (req, res) => {
  const s = tracker.getShipment(req.params.id);
  if (!s) return res.status(404).json({ error: "Shipment not found" });
  res.json(s);
});

router.post("/:id/track", (req, res) => {
  const event = tracker.recordTrackingEvent({
    shipment_id: req.params.id,
    ...req.body,
  });
  res.status(201).json(event);
});

router.patch("/:id/status", (req, res) => {
  const { status, ...extras } = req.body;
  const s = tracker.updateShipmentStatus(req.params.id, status, extras);
  if (!s) return res.status(404).json({ error: "Shipment not found" });
  res.json(s);
});

router.get("/:id/tracking", (req, res) => {
  const { trackingEvent } = require("@global-logistics/core/models");
  const events = trackingEvent.byShipment(req.params.id);
  res.json(events);
});

router.get("/:id/chain", (req, res) => {
  const { trackingEvent } = require("@global-logistics/core/models");
  const result = trackingEvent.verifyChain(req.params.id);
  res.json(result);
});

module.exports = router;
