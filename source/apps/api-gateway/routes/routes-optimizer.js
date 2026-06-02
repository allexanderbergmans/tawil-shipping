const { Router } = require("express");
const optimizer = require("@global-logistics/route-optimizer");

const router = Router();

router.get("/", (req, res) => {
  const { origin, destination, weight, prioritize } = req.query;
  if (!origin || !destination) return res.status(400).json({ error: "origin and destination required" });
  res.json(optimizer.findRoutes(origin, destination, weight, prioritize));
});

router.get("/lanes", (req, res) => {
  res.json(optimizer.allLanes());
});

module.exports = router;
