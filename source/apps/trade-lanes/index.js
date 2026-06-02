const { getDb } = require("@global-logistics/core/db");

function all() {
  const db = getDb();
  const lanes = db.prepare(`SELECT origin, destination, COUNT(*) as shipment_count,
    SUM(CASE WHEN status IN ('delivered','cleared') THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status IN ('delayed','exception','customs_hold') THEN 1 ELSE 0 END) as issues,
    COALESCE(AVG(CASE WHEN status IN ('delivered','cleared') THEN 1.0 ELSE NULL END), 0) as completion_rate,
    COALESCE(SUM(cargo_value), 0) as total_value,
    COALESCE(AVG(cargo_value), 0) as avg_value
    FROM shipments WHERE origin IS NOT NULL AND destination IS NOT NULL
    GROUP BY LOWER(origin), LOWER(destination)
    ORDER BY shipment_count DESC`).all();

  return lanes.map(l => ({
    origin: l.origin, destination: l.destination,
    total_shipments: l.shipment_count, completed: l.completed,
    issues: l.issues, issue_rate: l.shipment_count > 0 ? Math.round(l.issues / l.shipment_count * 100) : 0,
    completion_rate: Math.round(l.completion_rate * 100),
    total_value: l.total_value, avg_value: Math.round(l.avg_value),
    health: l.shipment_count > 0 && l.issues / l.shipment_count < 0.1 ? 'good' :
      l.shipment_count > 0 && l.issues / l.shipment_count < 0.3 ? 'fair' : 'poor',
  }));
}

function detail(origin, destination) {
  const db = getDb();
  const shipments = db.prepare(`SELECT * FROM shipments
    WHERE LOWER(origin)=LOWER(?) AND LOWER(destination)=LOWER(?)
    ORDER BY created_at DESC`).all(origin, destination);

  const timeline = db.prepare(`SELECT date(te.timestamp) as day, COUNT(*) as events
    FROM tracking_events te JOIN shipments s ON te.shipment_id = s.id
    WHERE LOWER(s.origin)=LOWER(?) AND LOWER(s.destination)=LOWER(?)
    AND te.timestamp > datetime('now', '-30 days')
    GROUP BY day ORDER BY day`).all(origin, destination);

  const carriers = db.prepare(`SELECT s.vessel_name as carrier, COUNT(*) as trips
    FROM shipments s WHERE LOWER(s.origin)=LOWER(?) AND LOWER(s.destination)=LOWER(?)
    AND s.vessel_name IS NOT NULL AND s.vessel_name != ''
    GROUP BY s.vessel_name ORDER BY trips DESC LIMIT 5`).all(origin, destination);

  return {
    origin, destination,
    total_shipments: shipments.length,
    shipments, timeline, carriers,
    avg_transit_days: estimateTransitDays(shipments),
  };
}

function estimateTransitDays(shipments) {
  let total = 0, count = 0;
  for (const s of shipments) {
    if (s.estimated_departure && s.estimated_arrival) {
      const dep = new Date(s.estimated_departure + "Z");
      const arr = new Date(s.estimated_arrival + "Z");
      if (!isNaN(dep) && !isNaN(arr)) {
        total += (arr - dep) / 86400000;
        count++;
      }
    }
  }
  return count > 0 ? Math.round(total / count * 10) / 10 : null;
}

module.exports = { all, detail };
