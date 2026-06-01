const { getDb } = require("@global-logistics/core/db");
const shipmentTracker = require("@global-logistics/shipment-tracker");

function overview() {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as count FROM shipments").get().count;
  const byStatus = db.prepare("SELECT status, COUNT(*) as count FROM shipments GROUP BY status").all();
  const pendingCompliance = db.prepare(`SELECT COUNT(*) as count FROM compliance_checks
    WHERE result IN ('fail','flag') AND checked_at > datetime('now', '-7 days')`).get().count;
  const totalValue = db.prepare("SELECT COALESCE(SUM(cargo_value), 0) as total FROM shipments").get().total;
  const inTransit = db.prepare("SELECT COUNT(*) as count FROM shipments WHERE status = 'in_transit'").get().count;
  return { total, inTransit, byStatus, pendingCompliance, totalValue };
}

function timeline(days = 7) {
  const db = getDb();
  return db.prepare(`SELECT date(timestamp) as day, status, COUNT(*) as count
    FROM tracking_events WHERE timestamp > datetime('now', ?)
    GROUP BY day, status ORDER BY day DESC`).all(`-${days} days`);
}

function bottlenecks() {
  const db = getDb();
  return db.prepare(`SELECT location, COUNT(*) as events, COUNT(DISTINCT shipment_id) as shipments
    FROM tracking_events WHERE status IN ('customs_hold', 'delayed', 'inspection')
    GROUP BY location ORDER BY events DESC LIMIT 10`).all();
}

function recentActivity(limit = 20) {
  const db = getDb();
  return db.prepare(`SELECT te.*, s.reference FROM tracking_events te
    JOIN shipments s ON te.shipment_id = s.id
    ORDER BY te.timestamp DESC LIMIT ?`).all(limit);
}

function complianceSummary() {
  const db = getDb();
  const results = db.prepare(`SELECT result, COUNT(*) as count FROM compliance_checks GROUP BY result`).all();
  const pending = db.prepare(`SELECT COUNT(DISTINCT shipment_id) as count FROM compliance_checks WHERE checked_at > datetime('now', '-7 days')`).get().count;
  const byRule = db.prepare(`    SELECT cr.type as rule_type, cc.result, COUNT(*) as count
    FROM compliance_checks cc JOIN compliance_rules cr ON cc.rule_id = cr.id
    WHERE cc.checked_at > datetime('now', '-30 days')
    GROUP BY cr.type, cc.result ORDER BY count DESC LIMIT 15`).all();
  return { byResult: results, pendingShipments: pending, byRule };
}

module.exports = { overview, timeline, bottlenecks, recentActivity, complianceSummary };
