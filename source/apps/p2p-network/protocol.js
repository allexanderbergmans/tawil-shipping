const crypto = require("crypto");

const MESSAGE_TYPES = [
  "tracking_event",
  "compliance_alert",
  "document_shared",
  "shipment_query",
  "shipment_response",
  "peer_discover",
  "peer_list",
  "ping",
  "pong",
];

function createMessage(type, payload) {
  if (!MESSAGE_TYPES.includes(type)) throw new Error(`Unknown message type: ${type}`);
  return JSON.stringify({
    type,
    id: crypto.randomBytes(8).toString("hex"),
    from: null,
    timestamp: new Date().toISOString(),
    payload,
  });
}

function parseMessage(data) {
  try {
    const msg = JSON.parse(data);
    if (!MESSAGE_TYPES.includes(msg.type)) return null;
    return msg;
  } catch {
    return null;
  }
}

module.exports = { createMessage, parseMessage, MESSAGE_TYPES };
