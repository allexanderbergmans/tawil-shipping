const { Router } = require("express");
const dashboard = require("@global-logistics/visibility-dashboard");

const router = Router();

router.get("/overview", (req, res) => {
  res.json(dashboard.overview());
});

router.get("/timeline", (req, res) => {
  const days = parseInt(req.query.days) || 7;
  res.json(dashboard.timeline(days));
});

router.get("/bottlenecks", (req, res) => {
  res.json(dashboard.bottlenecks());
});

router.get("/activity", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(dashboard.recentActivity(limit));
});

router.get("/compliance-summary", (req, res) => {
  res.json(dashboard.complianceSummary());
});

module.exports = router;
