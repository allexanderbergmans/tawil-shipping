const { P2PNode } = require("./node");
const { events, getDb } = require("@global-logistics/core/db");
const { trackingEvent, shipment, notification, document } = require("@global-logistics/core/models");

let node = null;

function start(opts = {}) {
  if (node) return node;

  node = new P2PNode({
    nodeId: opts.nodeId,
    port: opts.port || 0,
    peers: opts.peers || [],
    advertisedAddress: opts.advertisedAddress || process.env.P2P_ADDRESS,
  });

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

  node.on("message:compliance_alert", (payload) => {
    notification.create({
      type: "compliance_alert",
      shipment_id: payload.shipmentId,
      recipient: "compliance-team",
      subject: `[P2P] Compliance ${payload.result}: ${payload.rule}`,
      body: payload.details || "Received compliance alert from peer",
    });
  });

  node.on("message:document_shared", (payload) => {
    notification.create({
      type: "document_ready",
      shipment_id: payload.shipment_id,
      recipient: "stakeholders",
      subject: `[P2P] Document shared: ${payload.title || payload.type}`,
      body: `Document received from peer for shipment ${payload.shipment_id}`,
    });
  });

  node.on("peer_connected", ({ nodeId, address }) => {
    notification.create({
      type: "shipment_update",
      recipient: "network-admin",
      subject: `P2P Peer connected: ${nodeId}`,
      body: `Node ${nodeId} joined the mesh at ${address}`,
    });
  });

  events.on("shipment:tracking", (event) => {
    if (node && node.running) {
      node.broadcast("tracking_event", {
        shipment_id: event.shipment_id,
        status: event.status,
        location: event.location,
        description: event.description,
      });
    }
  });

  events.on("compliance:alert", ({ shipmentId, rule, result, details }) => {
    if (node && node.running) {
      node.broadcast("compliance_alert", {
        shipmentId,
        rule: rule.id,
        result,
        details,
      });
    }
  });

  events.on("document:created", (doc) => {
    if (node && node.running) {
      node.broadcast("document_shared", {
        shipment_id: doc.shipment_id,
        type: doc.type,
        title: doc.title,
        format: doc.format,
      });
    }
  });

  node.start();
  return node;
}

function stop() {
  if (node) node.stop();
  node = null;
}

function getNode() {
  return node;
}

module.exports = { start, stop, getNode, P2PNode };
