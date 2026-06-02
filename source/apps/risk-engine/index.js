const { getDb } = require("@global-logistics/core/db");

const WEIGHTS = {
  origin: { high_risk: 20, moderate: 10, low: 0 },
  destination: { high_risk: 20, moderate: 10, low: 0 },
  cargo: { hazardous: 25, perishable: 15, electronics: 10, standard: 5 },
  compliance: { fail: 40, flag: 20, pass: 0 },
  delay_history: { frequent: 25, occasional: 10, rare: 0 },
};

function assessOrigin(origin) {
  const highRisk = ["iraq", "afghanistan", "syria", "yemen", "somalia", "sudan", "venezuela"];
  const moderate = ["pakistan", "nigeria", "myanmar", "ukraine", "lebanon"];
  const o = (origin || "").toLowerCase();
  if (highRisk.some(h => o.includes(h))) return "high_risk";
  if (moderate.some(m => o.includes(m))) return "moderate";
  return "low";
}

function assessDestination(dest) {
  const congested = ["rotterdam", "singapore", "shanghai", "los angeles", "long beach", "felixstowe"];
  const d = (dest || "").toLowerCase();
  if (congested.some(c => d.includes(c))) return "high_risk";
  return "low";
}

function assessCargo(desc) {
  const d = (desc || "").toLowerCase();
  if (d.includes("chemical") || d.includes("explosive") || d.includes("gas") || d.includes("oil")) return "hazardous";
  if (d.includes("food") || d.includes("fruit") || d.includes("meat") || d.includes("dairy") || d.includes("pharma")) return "perishable";
  if (d.includes("computer") || d.includes("semiconductor") || d.includes("circuit")) return "electronics";
  return "standard";
}

function assessCompliance(shipmentId) {
  const db = getDb();
  const worst = db.prepare(`SELECT result FROM compliance_checks WHERE shipment_id = ? ORDER BY
    CASE result WHEN 'fail' THEN 0 WHEN 'flag' THEN 1 ELSE 2 END LIMIT 1`).get(shipmentId);
  return worst ? worst.result : "pass";
}

function assessDelayHistory(origin, destination) {
  const db = getDb();
  const recent = db.prepare(`SELECT COUNT(*) as c FROM tracking_events te
    JOIN shipments s ON te.shipment_id = s.id
    WHERE (s.origin = ? OR s.destination = ?) AND te.status IN ('delayed','exception')
    AND te.timestamp > datetime('now', '-90 days')`).get(origin, destination);
  if (recent.c >= 5) return "frequent";
  if (recent.c >= 2) return "occasional";
  return "rare";
}

function scoreShipment(s) {
  const oRisk = assessOrigin(s.origin);
  const dRisk = assessDestination(s.destination);
  const cType = assessCargo(s.cargo_description);
  const comp = assessCompliance(s.id);
  const delay = assessDelayHistory(s.origin, s.destination);

  const score = (WEIGHTS.origin[oRisk] || 0) + (WEIGHTS.destination[dRisk] || 0) +
    (WEIGHTS.cargo[cType] || 5) + (WEIGHTS.compliance[comp] || 0) +
    (WEIGHTS.delay_history[delay] || 0);

  let level = "low";
  if (score >= 80) level = "critical";
  else if (score >= 50) level = "high";
  else if (score >= 25) level = "medium";

  const factors = [];
  if (WEIGHTS.origin[oRisk] > 0) factors.push({ factor: "origin_risk", detail: `${s.origin} (${oRisk})`, weight: WEIGHTS.origin[oRisk] });
  if (WEIGHTS.destination[dRisk] > 0) factors.push({ factor: "destination_risk", detail: `${s.destination} (${dRisk})`, weight: WEIGHTS.destination[dRisk] });
  if (WEIGHTS.cargo[cType] > 5) factors.push({ factor: "cargo_type", detail: cType, weight: WEIGHTS.cargo[cType] });
  if (WEIGHTS.compliance[comp] > 0) factors.push({ factor: "compliance", detail: comp, weight: WEIGHTS.compliance[comp] });
  if (WEIGHTS.delay_history[delay] > 0) factors.push({ factor: "delay_history", detail: delay, weight: WEIGHTS.delay_history[delay] });

  return { score, level, factors };
}

function assessAll() {
  const db = getDb();
  const shipments = db.prepare("SELECT * FROM shipments ORDER BY created_at DESC").all();
  return shipments.map(s => ({ shipment_id: s.id, reference: s.reference, ...scoreShipment(s) }));
}

function assessOne(shipmentId) {
  const db = getDb();
  const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
  if (!s) return null;
  return { shipment_id: s.id, reference: s.reference, ...scoreShipment(s) };
}

function trending() {
  const db = getDb();
  const weekly = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status IN ('delayed','exception','customs_hold') THEN 1 ELSE 0 END) as issues
    FROM shipments WHERE created_at > datetime('now', '-7 days')`).get();
  return {
    weeklyShipments: weekly.total,
    weeklyIssues: weekly.issues,
    issueRate: weekly.total > 0 ? Math.round(weekly.issues / weekly.total * 100) : 0,
    topRiskOrigins: db.prepare(`SELECT origin, COUNT(*) as c FROM shipments
      WHERE status IN ('delayed','exception') GROUP BY origin ORDER BY c DESC LIMIT 5`).all(),
  };
}

module.exports = { scoreShipment, assessAll, assessOne, trending };
