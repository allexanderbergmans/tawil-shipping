const Database = require("better-sqlite3");
const path = require("path");
const { EventEmitter } = require("events");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "..", "..", "..", "data", "mesh.db");
const events = new EventEmitter();

let db;

function getDb() {
  if (!db) {
    const fs = require("fs");
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'operator',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      last_used_at TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      cargo_description TEXT,
      cargo_value REAL,
      cargo_currency TEXT DEFAULT 'USD',
      weight_kg REAL,
      volume_m3 REAL,
      shipper_name TEXT,
      shipper_country TEXT,
      consignee_name TEXT,
      consignee_country TEXT,
      vessel_name TEXT,
      vessel_imo TEXT,
      port_of_loading TEXT,
      port_of_discharge TEXT,
      estimated_departure TEXT,
      estimated_arrival TEXT,
      actual_departure TEXT,
      actual_arrival TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      location TEXT,
      location_lat REAL,
      location_lng REAL,
      description TEXT,
      timestamp TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_rules (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      country TEXT,
      pattern TEXT,
      min_value REAL,
      max_value REAL,
      action TEXT DEFAULT 'block',
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_checks (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      rule_id TEXT REFERENCES compliance_rules(id),
      result TEXT NOT NULL,
      details TEXT,
      checked_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_approvals (
      id TEXT PRIMARY KEY,
      shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
      check_id TEXT REFERENCES compliance_checks(id),
      approved_by TEXT REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      shipment_id TEXT REFERENCES shipments(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT,
      template_id TEXT,
      source_content TEXT,
      compiled_content TEXT,
      format TEXT DEFAULT 'html',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      variables TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      shipment_id TEXT REFERENCES shipments(id) ON DELETE SET NULL,
      user_id TEXT REFERENCES users(id),
      recipient TEXT,
      subject TEXT,
      body TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      events TEXT DEFAULT '[]',
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      last_triggered_at TEXT,
      failure_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      webhook_id TEXT REFERENCES webhooks(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload TEXT,
      status TEXT DEFAULT 'pending',
      response_code INTEGER,
      response_body TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
    CREATE INDEX IF NOT EXISTS idx_tracking_shipment ON tracking_events(shipment_id);
    CREATE INDEX IF NOT EXISTS idx_documents_shipment ON documents(shipment_id);
  `);

  migrate();
  seedRules();
  seedAdmin();
}

function migrate() {
  const migrations = [
    ["notifications", "user_id", "TEXT REFERENCES users(id)"],
    ["compliance_rules", "min_value", "REAL"],
    ["compliance_rules", "max_value", "REAL"],
    ["compliance_rules", "updated_at", "TEXT DEFAULT (datetime('now'))"],
    ["compliance_checks", "checked_by", "TEXT REFERENCES users(id)"],
    ["documents", "template_id", "TEXT REFERENCES document_templates(id)"],
  ];
  for (const [table, column, colDef] of migrations) {
    try {
      const cols = db.prepare("PRAGMA table_info(?)").all(table);
      if (!cols.find(c => c.name === column)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef}`);
      }
    } catch {}
  }

  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_compliance_shipment ON compliance_checks(shipment_id)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(is_read) WHERE is_read = 0",
    "CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id)",
  ];
  for (const idx of indexes) {
    try { db.exec(idx); } catch {}
  }
}

function seedRules() {
  const count = db.prepare("SELECT COUNT(*) as c FROM compliance_rules").get().c;
  if (count > 0) return;

  const insert = db.prepare(`INSERT INTO compliance_rules (id, type, country, pattern, min_value, max_value, action, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const rules = [
    ["cr_sanctions_ir", "sanctions", "IR", null, null, null, "block", "Iran trade embargo — all shipments to/from Iran are blocked"],
    ["cr_sanctions_kp", "sanctions", "KP", null, null, null, "block", "North Korea trade embargo"],
    ["cr_sanctions_sy", "sanctions", "SY", null, null, null, "block", "Syria trade embargo"],
    ["cr_sanctions_cu", "sanctions", "CU", null, null, null, "block", "Cuba trade embargo"],
    ["cr_customs_docs", "customs", null, null, 50000, null, "flag", "High-value shipments (>$50K) require additional customs documentation"],
    ["cr_customs_weight", "customs", null, null, null, 10000, "flag", "Shipments over 10,000 kg flagged for weight inspection"],
    ["cr_restricted_dual_use", "restricted_party", null, "dual.use", null, null, "warn", "Dual-use goods flagged for review"],
    ["cr_embargo_ru", "embargo", "RU", null, null, null, "block", "Russia trade restrictions"],
    ["cr_embargo_by", "embargo", "BY", null, null, null, "block", "Belarus trade restrictions"],
    ["cr_sanctions_mm", "sanctions", "MM", null, null, null, "block", "Myanmar trade embargo"],
    ["cr_embargo_ve", "embargo", "VE", null, null, null, "flag", "Venezuela — enhanced due diligence required"],
  ];
  for (const r of rules) insert.run(...r);
}

function seedAdmin() {
  const count = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
  if (count > 0) return;
  const bcrypt = require("bcryptjs");
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .run("usr_admin", "admin", "admin@mesh.local", hash, "admin");
}

module.exports = { getDb, events };
