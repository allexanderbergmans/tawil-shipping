const { Router } = require("express");
const { notification } = require("@global-logistics/core/models");

const router = Router();

router.get("/", (req, res) => {
  const unreadOnly = req.query.unread === "true";
  res.json(notification.all(unreadOnly));
});

router.get("/shipment/:shipmentId", (req, res) => {
  res.json(notification.byShipment(req.params.shipmentId));
});

router.patch("/:id/read", (req, res) => {
  const n = notification.markRead(req.params.id);
  if (!n) return res.status(404).json({ error: "Notification not found" });
  res.json(n);
});

router.post("/read-all", (req, res) => {
  notification.markAllRead();
  res.json({ ok: true });
});

module.exports = router;
