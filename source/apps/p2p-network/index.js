const { P2PNode } = require("./node");
const { events, getDb } = require("@global-logistics/core/db");
const { trackingEvent, shipment, notification, document } = require("@global-logistics/core/models");
const sync = require("./sync");

let node = null;
let syncState = { inProgress: false, snapshotId: null, chunksReceived: 0, chunksTotal: 0, currentNodeId: null };

function start(opts = {}) {
  if (node) return node;

  node = new P2PNode({
    nodeId: opts.nodeId,
    port: opts.port || 0,
    peers: opts.peers || [],
    advertisedAddress: opts.advertisedAddress || process.env.P2P_ADDRESS,
  });

  // ── Inbound: tracking_event ──
  node.on("message:tracking_event", (payload) => {
    if (!payload) return;
    const existing = shipment.getById(payload.shipment_id);
    if (!existing) {
      const s = shipment.create({
        origin: payload.location || "unknown",
        destination: payload.location || "unknown",
        cargo_description: payload.description || "P2P synced shipment",
      });
      trackingEvent.create({
        shipment_id: s.id,
        status: payload.status,
        location: payload.location,
        description: `[P2P] ${payload.description || "Synced from peer"}`,
      });
    } else {
      trackingEvent.create({
        shipment_id: payload.shipment_id,
        status: payload.status,
        location: payload.location,
        description: `[P2P] ${payload.description || "Received from peer"}`,
      });
      shipment.updateStatus(payload.shipment_id, payload.status);
    }
  });

  // ── Inbound: compliance_alert ──
  node.on("message:compliance_alert", (payload) => {
    notification.create({
      type: "compliance_alert",
      shipment_id: payload.shipmentId,
      recipient: "compliance-team",
      subject: `[P2P] Compliance ${payload.result}: ${payload.rule}`,
      body: payload.details || "Received compliance alert from peer",
    });
  });

  // ── Inbound: document_shared ──
  node.on("message:document_shared", (payload) => {
    notification.create({
      type: "document_ready",
      shipment_id: payload.shipment_id,
      recipient: "stakeholders",
      subject: `[P2P] Document shared: ${payload.title || payload.type}`,
      body: `Document received from peer for shipment ${payload.shipment_id}`,
    });
  });

  // ── Inbound: DB snapshot request ──
  node.on("message:db_snapshot_request", (payload, fromNodeId) => {
    const tables = sync.generateSnapshot();
    const chunks = sync.snapshotToChunks(tables, node.nodeId, payload.snapshotId || (node.nodeId + "-" + Date.now()));
    // Send chunks with a small delay between to avoid flooding
    let i = 0;
    function sendNext() {
      if (i >= chunks.length) return;
      node.broadcast("db_snapshot_chunk", chunks[i++]);
      setImmediate(sendNext);
    }
    sendNext();
    sync.logSync(fromNodeId || "peer", "snapshot_sent", { tables: Object.keys(tables), chunkCount: chunks.length });
  });

  // ── Inbound: DB snapshot chunk ──
  node.on("message:db_snapshot_chunk", (payload) => {
    if (!syncState.inProgress) {
      syncState.inProgress = true;
      syncState.snapshotId = payload.snapshotId;
      syncState.chunksReceived = 0;
      syncState.currentNodeId = payload.from;
    }
    if (payload.snapshotId !== syncState.snapshotId) return; // ignore stale chunks
    const result = sync.applySnapshotChunk(payload);
    syncState.chunksReceived++;
    syncState.chunksTotal = payload.totalTables;
    if (payload.table === "__done__") {
      syncState.inProgress = false;
      sync.logSync(syncState.currentNodeId || "peer", "snapshot_applied", {
        chunksReceived: syncState.chunksReceived,
        snapshotId: syncState.snapshotId,
      });
      syncState.currentNodeId = null;
    }
  });

  // ── Inbound: DB row sync ──
  node.on("message:db_row_sync", (payload) => {
    sync.applyRowSync(payload);
  });

  // ── Peer connected: request snapshot if we have no data ──
  node.on("peer_connected", ({ nodeId, address }) => {
    const status = sync.getSyncStatus();
    if (status.totalRows === 0) {
      // Request full snapshot from the new peer
      setTimeout(() => {
        node.broadcast("db_snapshot_request", { snapshotId: node.nodeId + "-" + Date.now() });
        sync.logSync(nodeId, "snapshot_requested", { from: address });
      }, 500);
    }
    // Create notification
    notification.create({
      type: "shipment_update",
      recipient: "network-admin",
      subject: `P2P Peer connected: ${nodeId}`,
      body: `Node ${nodeId} joined the mesh at ${address}`,
    });
  });

  // ── Outbound: shipment tracking events ──
  events.on("shipment:tracking", (event) => {
    if (node && node.running) {
      node.broadcast("tracking_event", {
        shipment_id: event.shipment_id,
        status: event.status,
        location: event.location,
        description: event.description,
      });
      node.broadcast("db_row_sync", {
        table: "tracking_events", action: "upsert",
        row: event,
      });
    }
  });

  // ── Outbound: compliance alerts ──
  events.on("compliance:alert", ({ shipmentId, rule, result, details }) => {
    if (node && node.running) {
      node.broadcast("compliance_alert", { shipmentId, rule: rule.id, result, details });
    }
  });

  // ── Outbound: document created ──
  events.on("document:created", (doc) => {
    if (node && node.running) {
      node.broadcast("document_shared", {
        shipment_id: doc.shipment_id, type: doc.type, title: doc.title, format: doc.format,
      });
      node.broadcast("db_row_sync", {
        table: "documents", action: "upsert", row: doc,
      });
    }
  });

  // ── Outbound: shipment changes via db_row_sync ──
  events.on("shipment:updated", (shipmentRow) => {
    if (node && node.running) {
      node.broadcast("db_row_sync", {
        table: "shipments", action: "upsert", row: shipmentRow,
      });
    }
  });

  node.start();
  return node;
}

function stop() {
  if (node) node.stop();
  node = null;
  syncState = { inProgress: false, snapshotId: null, chunksReceived: 0, chunksTotal: 0, currentNodeId: null };
}

function getNode() { return node; }

function triggerSync() {
  if (!node || !node.running) return { error: "P2P node not running" };
  node.broadcast("db_snapshot_request", { snapshotId: node.nodeId + "-" + Date.now() });
  return { triggered: true, fromNodeId: node.nodeId };
}

function getSyncState() { return { ...syncState, ...sync.getSyncStatus() }; }

function getSyncLog(limit = 50) { return sync.getSyncLog(limit); }

module.exports = { start, stop, getNode, P2PNode, triggerSync, getSyncState, getSyncLog };
