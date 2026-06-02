const { getDb } = require("@global-logistics/core/db");

const EMISSION_FACTORS = {
  air: 0.85,
  sea: 0.015,
  road: 0.12,
  rail: 0.028,
};

const MODE_KEYWORDS = {
  air: ["air", "flight", "plane", "aircraft", "cargo aircraft"],
  sea: ["sea", "ocean", "vessel", "ship", "container ship", "tanker", "maritime"],
  road: ["road", "truck", "lorry", "trailer", "tractor", "van", "container truck"],
  rail: ["rail", "train", "railway", "freight train"],
};

function detectMode(shipment) {
  const text = [
    shipment.vessel_name, shipment.vessel_imo,
    shipment.port_of_loading, shipment.port_of_discharge,
    shipment.cargo_description,
  ].filter(Boolean).join(" ").toLowerCase();
  for (const [mode, keywords] of Object.entries(MODE_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return mode;
  }
  return "sea";
}

function estimateDistance(origin, destination) {
  const known = {
    "new york|rotterdam": 5865, "shanghai|rotterdam": 9320, "singapore|rotterdam": 10820,
    "rotterdam|new york": 5865, "rotterdam|shanghai": 9320, "rotterdam|singapore": 10820,
    "london|new york": 5570, "new york|london": 5570, "dubai|singapore": 5830,
    "singapore|dubai": 5830, "shanghai|los angeles": 10450, "los angeles|shanghai": 10450,
    "cairo|rotterdam": 3270, "rotterdam|cairo": 3270,
  };
  const key = ((origin || "") + "|" + (destination || "")).toLowerCase();
  if (known[key]) return known[key];
  return 5000;
}

function calculate(shipment) {
  const mode = detectMode(shipment);
  const distance = estimateDistance(shipment.origin, shipment.destination);
  const weight = shipment.weight_kg ? parseFloat(shipment.weight_kg) : 1000;
  const factor = EMISSION_FACTORS[mode] || EMISSION_FACTORS.sea;
  const co2Kg = Math.round(distance * (weight / 1000) * factor);
  const co2Tonnes = Math.round(co2Kg / 1000 * 10) / 10;
  const offsetCost = Math.round(co2Tonnes * 15); // $15/tonne carbon credit

  return {
    mode,
    distance_km: distance,
    weight_kg: weight,
    emission_factor: factor,
    co2_kg: co2Kg,
    co2_tonnes: co2Tonnes,
    offset_cost_usd: offsetCost,
    equivalent_km_driven: Math.round(co2Kg / 0.25),
  };
}

function forShipment(shipmentId) {
  const db = getDb();
  const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
  if (!s) return null;
  return { shipment_id: s.id, reference: s.reference, ...calculate(s) };
}

function fleetSummary() {
  const db = getDb();
  const shipments = db.prepare("SELECT * FROM shipments ORDER BY created_at DESC").all();
  const results = shipments.map(s => ({ id: s.id, reference: s.reference, ...calculate(s) }));
  const totalCO2 = results.reduce((a, r) => a + r.co2_kg, 0);
  const totalOffset = results.reduce((a, r) => a + r.offset_cost_usd, 0);
  const byMode = {};
  for (const r of results) {
    byMode[r.mode] = (byMode[r.mode] || 0) + r.co2_kg;
  }
  return {
    totalCo2Kg: totalCO2,
    totalCo2Tonnes: Math.round(totalCO2 / 1000 * 10) / 10,
    totalOffsetCost: totalOffset,
    shipmentCount: results.length,
    byMode: Object.entries(byMode).map(([mode, kg]) => ({ mode, co2_kg: kg })),
    perShipment: results.slice(0, 10),
  };
}

module.exports = { calculate, forShipment, fleetSummary };
