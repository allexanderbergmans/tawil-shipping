const { Router } = require("express");
const auth = require("@global-logistics/auth");
const tracker = require("@global-logistics/shipment-tracker");
const { trackingEvent } = require("@global-logistics/core/models");
const Joi = require("joi");

const router = Router();
router.use(auth.middleware);
router.use(auth.authorize(["admin", "operator"]));

router.post("/shipments", (req, res) => {
  const schema = Joi.object({
    shipments: Joi.array().items(Joi.object({
      origin: Joi.string().required(),
      destination: Joi.string().required(),
      cargo_description: Joi.string().optional(),
      cargo_value: Joi.number().optional(),
    })).min(1).max(1000).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const results = { created: [], errors: [] };
  for (const data of value.shipments) {
    try {
      const s = tracker.createShipment(data);
      results.created.push({ reference: s.reference, id: s.id });
    } catch (e) {
      results.errors.push({ data, error: e.message });
    }
  }
  res.status(results.errors.length ? 207 : 201).json(results);
});

router.post("/tracking", (req, res) => {
  const schema = Joi.object({
    events: Joi.array().items(Joi.object({
      shipment_id: Joi.string().required(),
      status: Joi.string().required(),
      location: Joi.string().optional(),
      description: Joi.string().optional(),
      timestamp: Joi.string().optional(),
    })).min(1).max(1000).required(),
  });
  const { error, value } = schema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details[0].message });

  const results = { recorded: [], errors: [] };
  for (const ev of value.events) {
    try {
      const e = trackingEvent.create(ev);
      if (ev.status) {
        const { shipment: shipModel } = require("@global-logistics/core/models");
        shipModel.updateStatus(ev.shipment_id, ev.status);
      }
      results.recorded.push({ id: e.id, shipment_id: e.shipment_id });
    } catch (e) {
      results.errors.push({ event: ev, error: e.message });
    }
  }
  res.status(results.errors.length ? 207 : 201).json(results);
});

module.exports = router;
