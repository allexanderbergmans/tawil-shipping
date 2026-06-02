const { Router } = require("express");
const carbon = require("@global-logistics/carbon-tracker");

const router = Router();

router.get("/fleet", (req, res) => {
  res.json(carbon.fleetSummary());
});

router.get("/:shipmentId", (req, res) => {
  const result = carbon.forShipment(req.params.shipmentId);
  if (!result) return res.status(404).json({ error: "Shipment not found" });
  res.json(result);
});

module.exports = router;
