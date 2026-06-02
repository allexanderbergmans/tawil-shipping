const { getDb } = require("@global-logistics/core/db");

// Tables that are synced across the P2P mesh (operational data only)
const SYNC_TABLES = [
  { name: "shipments", key: "id", ts: "updated_at" },
  { name: "tracking_events", key: "id", ts: "created_at" },
  { name: "compliance_rules", key: "id", ts: "updated_at" },
  { name: "compliance_checks", key: "id", ts: "checked_at" },
  { name: "compliance_approvals", key: "id", ts: "updated_at" },
  { name: "documents", key: "id", ts: "created_at" },
  { name: "notifications", key: "id", ts: "created_at" },
  { name: "route_catalog", key: "id", ts: null },
  { name: "slas", key: "id", ts: "updated_at" },
  { name: "sla_breaches", key: "id", ts: "detected_at" },
  { name: "telemetry", key: "id", ts: "recorded_at" },
  { name: "telemetry_alerts", key: "id", ts: "created_at" },
];

const CHUNK_SIZE = 50; // rows per snapshot chunk

// ── Snapshot generation ──

function generateSnapshot() {
  const db = getDb();
  const tables = {};
  for (const t of SYNC_TABLES) {
    tables[t.name] = db.prepare(`SELECT * FROM ${t.name}`).all();
  }
  return tables;
}

function snapshotToChunks(tables, nodeId, snapshotId) {
  const chunks = [];
  let seq = 0;
  for (const t of SYNC_TABLES) {
    const rows = tables[t.name] || [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      chunks.push({
        snapshotId,
        seq: seq++,
        table: t.name,
        rows: rows.slice(i, i + CHUNK_SIZE),
        totalTables: SYNC_TABLES.length,
        totalRows: Object.values(tables).reduce((a, r) => a + r.length, 0),
        from: nodeId,
      });
    }
  }
  // Add a final sentinel chunk
  chunks.push({
    snapshotId,
    seq: seq,
    table: "__done__",
    rows: [],
    totalTables: SYNC_TABLES.length,
    totalRows: Object.values(tables).reduce((a, r) => a + r.length, 0),
    from: nodeId,
  });
  return chunks;
}

// ── Snapshot application ──

function applySnapshotChunk(chunk) {
  if (chunk.table === "__done__") return { applied: 0, done: true };
  const db = getDb();
  let applied = 0;
  for (const row of chunk.rows) {
    if (upsertRow(db, chunk.table, row)) applied++;
  }
  return { applied, done: false };
}

// ── Incremental row sync ──

function applyRowSync(msg) {
  const db = getDb();
  const table = msg.table;
  const row = msg.row;
  const action = msg.action || "upsert";

  const tableDef = SYNC_TABLES.find(t => t.name === table);
  if (!tableDef) return { applied: false, reason: "table not synced" };

  if (action === "delete") {
    db.prepare(`DELETE FROM ${table} WHERE ${tableDef.key} = ?`).run(row[tableDef.key]);
    return { applied: true, action: "delete" };
  }

  return { applied: upsertRow(db, table, row), action: "upsert" };
}

// ── Conflict-resolving upsert ──

function upsertRow(db, table, row) {
  const tableDef = SYNC_TABLES.find(t => t.name === table);
  if (!tableDef) return false;

  const existing = db.prepare(`SELECT * FROM ${table} WHERE ${tableDef.key} = ?`).get(row[tableDef.key]);

  if (existing) {
    // Conflict resolution: later timestamp wins, then higher node ID wins
    if (tableDef.ts && row[tableDef.ts] && existing[tableDef.ts]) {
      const rowTs = new Date(row[tableDef.ts]).getTime();
      const existingTs = new Date(existing[tableDef.ts]).getTime();
      if (rowTs < existingTs) return false;
      if (rowTs === existingTs && row.nodeId && existing.nodeId && row.nodeId <= existing.nodeId) return false;
    }
    // Build UPDATE query dynamically
    const cols = Object.keys(row).filter(c => c !== tableDef.key);
    const setClauses = cols.map(c => `${c} = ?`).join(", ");
    const params = cols.map(c => row[c]);
    params.push(row[tableDef.key]);
    db.prepare(`UPDATE ${table} SET ${setClauses} WHERE ${tableDef.key} = ?`).run(...params);
  } else {
    // INSERT
    const cols = Object.keys(row);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map(c => row[c]);
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`).run(...values);
  }
  return true;
}

// ── Sync log ──

function logSync(nodeId, action, details = {}) {
  const db = getDb();
  db.prepare(`INSERT INTO sync_log (id, peer_node_id, action, details, status)
    VALUES (?, ?, ?, ?, ?)`).run(
    "syn_" + require("crypto").randomBytes(8).toString("hex"),
    nodeId,
    action,
    JSON.stringify(details),
    details.status || "completed"
  );
}

function getSyncLog(limit = 50) {
  const db = getDb();
  return db.prepare(`SELECT * FROM sync_log ORDER BY created_at DESC LIMIT ?`).all(limit);
}

// ── Helpers ──

function getTables() {
  return SYNC_TABLES.map(t => t.name);
}

function getSyncStatus() {
  const db = getDb();
  const rows = {};
  for (const t of SYNC_TABLES) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get().c;
    rows[t.name] = count;
  }
  const lastSync = db.prepare("SELECT created_at FROM sync_log ORDER BY created_at DESC LIMIT 1").get();
  return {
    tables: rows,
    totalRows: Object.values(rows).reduce((a, c) => a + c, 0),
    lastSyncAt: lastSync ? lastSync.created_at : null,
    syncableTables: SYNC_TABLES.length,
  };
}

module.exports = {
  SYNC_TABLES,
  CHUNK_SIZE,
  generateSnapshot,
  snapshotToChunks,
  applySnapshotChunk,
  applyRowSync,
  upsertRow,
  logSync,
  getSyncLog,
  getTables,
  getSyncStatus,
};
