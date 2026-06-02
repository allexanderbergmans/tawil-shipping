const { getDb } = require("@global-logistics/core/db");
const crypto = require("crypto");

const ROUTES = [
  { origin: "Shanghai", dest: "Rotterdam", mode: "sea", days: 28, cost_per_kg: 0.25, co2_per_kg: 0.015, reliability: 0.92 },
  { origin: "Shanghai", dest: "Rotterdam", mode: "air", days: 2, cost_per_kg: 4.50, co2_per_kg: 0.85, reliability: 0.97 },
  { origin: "Shanghai", dest: "Rotterdam", mode: "rail", days: 16, cost_per_kg: 0.80, co2_per_kg: 0.028, reliability: 0.88 },
  { origin: "Shanghai", dest: "Los Angeles", mode: "sea", days: 14, cost_per_kg: 0.20, co2_per_kg: 0.012, reliability: 0.93 },
  { origin: "Shanghai", dest: "Los Angeles", mode: "air", days: 1.5, cost_per_kg: 3.80, co2_per_kg: 0.82, reliability: 0.96 },
  { origin: "Shanghai", dest: "Singapore", mode: "sea", days: 5, cost_per_kg: 0.12, co2_per_kg: 0.008, reliability: 0.95 },
  { origin: "Shanghai", dest: "Singapore", mode: "air", days: 1, cost_per_kg: 2.50, co2_per_kg: 0.78, reliability: 0.98 },
  { origin: "Rotterdam", dest: "New York", mode: "sea", days: 8, cost_per_kg: 0.18, co2_per_kg: 0.010, reliability: 0.94 },
  { origin: "Rotterdam", dest: "New York", mode: "air", days: 1.5, cost_per_kg: 3.20, co2_per_kg: 0.80, reliability: 0.97 },
  { origin: "Rotterdam", dest: "Shanghai", mode: "sea", days: 27, cost_per_kg: 0.22, co2_per_kg: 0.014, reliability: 0.91 },
  { origin: "Rotterdam", dest: "Shanghai", mode: "air", days: 2, cost_per_kg: 4.20, co2_per_kg: 0.83, reliability: 0.96 },
  { origin: "Rotterdam", dest: "Shanghai", mode: "rail", days: 17, cost_per_kg: 0.85, co2_per_kg: 0.030, reliability: 0.87 },
  { origin: "Dubai", dest: "Singapore", mode: "sea", days: 6, cost_per_kg: 0.14, co2_per_kg: 0.009, reliability: 0.93 },
  { origin: "Dubai", dest: "Singapore", mode: "air", days: 1, cost_per_kg: 2.80, co2_per_kg: 0.79, reliability: 0.97 },
  { origin: "Cairo", dest: "Rotterdam", mode: "sea", days: 8, cost_per_kg: 0.16, co2_per_kg: 0.011, reliability: 0.90 },
  { origin: "Cairo", dest: "Rotterdam", mode: "air", days: 1.5, cost_per_kg: 3.00, co2_per_kg: 0.81, reliability: 0.95 },
  { origin: "Cairo", dest: "Rotterdam", mode: "road", days: 4, cost_per_kg: 0.50, co2_per_kg: 0.12, reliability: 0.85 },
  { origin: "Los Angeles", dest: "Shanghai", mode: "sea", days: 15, cost_per_kg: 0.21, co2_per_kg: 0.013, reliability: 0.92 },
  { origin: "Los Angeles", dest: "Shanghai", mode: "air", days: 1.5, cost_per_kg: 3.60, co2_per_kg: 0.81, reliability: 0.96 },
  { origin: "Mumbai", dest: "Rotterdam", mode: "sea", days: 18, cost_per_kg: 0.19, co2_per_kg: 0.012, reliability: 0.89 },
  { origin: "Mumbai", dest: "Rotterdam", mode: "air", days: 2, cost_per_kg: 3.50, co2_per_kg: 0.82, reliability: 0.95 },
  { origin: "Mumbai", dest: "Shanghai", mode: "sea", days: 8, cost_per_kg: 0.15, co2_per_kg: 0.010, reliability: 0.91 },
  { origin: "Mumbai", dest: "Shanghai", mode: "air", days: 1, cost_per_kg: 2.90, co2_per_kg: 0.79, reliability: 0.96 },
  { origin: "Singapore", dest: "Rotterdam", mode: "sea", days: 22, cost_per_kg: 0.23, co2_per_kg: 0.014, reliability: 0.91 },
  { origin: "Singapore", dest: "Rotterdam", mode: "air", days: 2, cost_per_kg: 4.00, co2_per_kg: 0.84, reliability: 0.96 },
  { origin: "Singapore", dest: "Shanghai", mode: "sea", days: 5, cost_per_kg: 0.11, co2_per_kg: 0.007, reliability: 0.95 },
  { origin: "Singapore", dest: "Shanghai", mode: "air", days: 1, cost_per_kg: 2.30, co2_per_kg: 0.76, reliability: 0.98 },
  { origin: "Tokyo", dest: "Los Angeles", mode: "sea", days: 11, cost_per_kg: 0.19, co2_per_kg: 0.012, reliability: 0.93 },
  { origin: "Tokyo", dest: "Los Angeles", mode: "air", days: 1, cost_per_kg: 3.40, co2_per_kg: 0.80, reliability: 0.97 },
  { origin: "Tokyo", dest: "Shanghai", mode: "sea", days: 3, cost_per_kg: 0.08, co2_per_kg: 0.005, reliability: 0.96 },
  { origin: "Tokyo", dest: "Shanghai", mode: "air", days: 0.5, cost_per_kg: 1.80, co2_per_kg: 0.72, reliability: 0.99 },
];

function seed() {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM route_catalog").get().c;
  if (count > 0) return;
  const ins = db.prepare("INSERT INTO route_catalog (id,origin,destination,mode,transit_days,cost_per_kg,co2_per_kg,reliability) VALUES (?,?,?,?,?,?,?,?)");
  for (const r of ROUTES) {
    ins.run("rt_" + crypto.randomBytes(4).toString("hex"), r.origin, r.dest, r.mode, r.days, r.cost_per_kg, r.co2_per_kg, r.reliability);
  }
}

function findRoutes(origin, destination, weightKg = 1000, prioritize = "balanced") {
  const db = getDb();
  seed();
  const weight = parseFloat(weightKg) || 1000;
  const routes = db.prepare("SELECT * FROM route_catalog WHERE LOWER(origin)=LOWER(?) AND LOWER(destination)=LOWER(?)").all(origin, destination);
  if (!routes.length) return { origin, destination, weight_kg: weight, routes: [], note: "No routes found for this lane. Check origin/destination names." };

  const enhanced = routes.map(r => {
    const totalCost = r.cost_per_kg * weight;
    const totalCO2 = r.co2_per_kg * weight;
    const score = prioritize === "cost" ? totalCost : prioritize === "time" ? r.transit_days : prioritize === "eco" ? totalCO2 : (totalCost * 0.4 + r.transit_days * 0.3 + totalCO2 * 100 * 0.3);
    return {
      id: r.id, mode: r.mode, origin: r.origin, destination: r.destination,
      transit_days: r.transit_days, cost_per_kg: r.cost_per_kg,
      total_cost: Math.round(totalCost * 100) / 100,
      co2_per_kg: r.co2_per_kg, total_co2_kg: Math.round(totalCO2 * 10) / 10,
      reliability: r.reliability, score: Math.round(score * 100) / 100,
    };
  });

  enhanced.sort((a, b) => a.score - b.score);
  if (prioritize === "cost") enhanced.sort((a, b) => a.total_cost - b.total_cost);
  else if (prioritize === "time") enhanced.sort((a, b) => a.transit_days - b.transit_days);
  else if (prioritize === "eco") enhanced.sort((a, b) => a.total_co2_kg - b.total_co2_kg);

  return { origin, destination, weight_kg: weight, prioritize, routes: enhanced, recommended: enhanced[0] };
}

function allLanes() {
  const db = getDb();
  seed();
  const lanes = db.prepare("SELECT DISTINCT origin, destination FROM route_catalog ORDER BY origin").all();
  return lanes;
}

module.exports = { findRoutes, allLanes, ROUTES };
