const { getDb, events } = require("@global-logistics/core/db");
const crypto = require("crypto");

const SENSOR_TYPES = ["temperature", "humidity", "shock", "gps_lat", "gps_lng", "pressure"];
const THRESHOLDS = {
  temperature: { min: -10, max: 35, unit: "°C", label: "Temperature", icon: "🌡️" },
  humidity: { min: 20, max: 85, unit: "%", label: "Humidity", icon: "💧" },
  shock: { min: 0, max: 5, unit: "G", label: "Shock/Vibration", icon: "💥" },
  pressure: { min: 900, max: 1100, unit: "hPa", label: "Pressure", icon: "🔽" },
};

function generate(shipmentId, count = 1) {
  const db = getDb();
  const s = db.prepare("SELECT * FROM shipments WHERE id = ?").get(shipmentId);
  if (!s) return [];

  const cargo = (s.cargo_description || "").toLowerCase();
  const isSensitive = cargo.includes("pharma") || cargo.includes("food") || cargo.includes("chemical") || cargo.includes("electron");

  const results = [];
  for (let i = 0; i < count; i++) {
    const id = "tel_" + crypto.randomBytes(6).toString("hex");
    const telemetry = {
      temperature: isSensitive ? 18 + Math.random() * 8 : 15 + Math.random() * 20,
      humidity: isSensitive ? 35 + Math.random() * 20 : 30 + Math.random() * 40,
      shock: Math.random() * 3,
      pressure: 980 + Math.random() * 40,
      gps_lat: 25 + Math.random() * 30,
      gps_lng: -10 + Math.random() * 60,
    };

    // Occasionally generate out-of-threshold readings for interesting alerts
    if (Math.random() < 0.15) telemetry.temperature = THRESHOLDS.temperature.max + Math.random() * 5;
    if (Math.random() < 0.08) telemetry.shock = THRESHOLDS.shock.max + Math.random() * 3;

    const json = JSON.stringify(telemetry);
    db.prepare("INSERT INTO telemetry (id, shipment_id, sensor_data, recorded_at) VALUES (?,?,?,datetime('now'))").run(id, shipmentId, json);

    const alerts = checkThresholds(telemetry, shipmentId);
    results.push({ id, shipment_id: shipmentId, sensor_data: telemetry, alerts });
  }
  return results;
}

function checkThresholds(data, shipmentId) {
  const alerts = [];
  for (const [sensor, value] of Object.entries(data)) {
    const t = THRESHOLDS[sensor];
    if (!t) continue;
    if (value < t.min || value > t.max) {
      const alertType = value < t.min ? "low" : "high";
      const alertMsg = `${t.icon} ${t.label} alert: ${value.toFixed(1)}${t.unit} (${alertType})`;
      alerts.push({ sensor, value: Math.round(value * 10) / 10, threshold: t, alert: alertMsg });

      const db = getDb();
      const existing = db.prepare("SELECT id FROM telemetry_alerts WHERE shipment_id = ? AND sensor = ? AND resolved = 0").get(shipmentId, sensor);
      if (!existing) {
        const aid = "tla_" + crypto.randomBytes(6).toString("hex");
        db.prepare("INSERT INTO telemetry_alerts (id, shipment_id, sensor, value, message, severity) VALUES (?,?,?,?,?,?)").run(
          aid, shipmentId, sensor, Math.round(value * 10) / 10, alertMsg, alertType === "high" ? "critical" : "warning"
        );
        events.emit("telemetry:alert", { id: aid, shipment_id: shipmentId, sensor, value, message: alertMsg });
      }
    }
  }
  return alerts;
}

function latest(shipmentId) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM telemetry WHERE shipment_id = ? ORDER BY recorded_at DESC LIMIT 1").get(shipmentId);
  if (!row) return null;
  return { ...row, sensor_data: JSON.parse(row.sensor_data) };
}

function history(shipmentId, limit = 50) {
  const db = getDb();
  return db.prepare("SELECT * FROM telemetry WHERE shipment_id = ? ORDER BY recorded_at DESC LIMIT ?").all(shipmentId, limit).map(r => ({
    ...r, sensor_data: JSON.parse(r.sensor_data),
  }));
}

function alerts(shipmentId, unresolvedOnly = true) {
  const db = getDb();
  if (unresolvedOnly) return db.prepare("SELECT * FROM telemetry_alerts WHERE shipment_id = ? AND resolved = 0 ORDER BY created_at DESC").all(shipmentId);
  return db.prepare("SELECT * FROM telemetry_alerts WHERE shipment_id = ? ORDER BY created_at DESC LIMIT 20").all(shipmentId);
}

function resolveAlert(alertId) {
  getDb().prepare("UPDATE telemetry_alerts SET resolved = 1, resolved_at = datetime('now') WHERE id = ?").run(alertId);
}

function activeAlerts() {
  const db = getDb();
  return db.prepare(`SELECT a.*, s.reference FROM telemetry_alerts a
    JOIN shipments s ON a.shipment_id = s.id
    WHERE a.resolved = 0 ORDER BY a.created_at DESC LIMIT 50`).all();
}

module.exports = { generate, latest, history, alerts, resolveAlert, activeAlerts, THRESHOLDS };
