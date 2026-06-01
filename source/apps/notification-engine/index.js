const { events } = require("@global-logistics/core/db");
const { notification } = require("@global-logistics/core/models");

function start() {
  events.on("shipment:tracking", (event) => {
    notification.create({
      type: "shipment_update",
      shipment_id: event.shipment_id,
      recipient: "stakeholders",
      subject: `Shipment ${event.shipment_id} — ${event.status}`,
      body: event.description || `Tracking update: ${event.status} at ${event.location}`,
    });
  });

  events.on("compliance:alert", ({ shipmentId, rule, result, details }) => {
    const level = result === "fail" ? "BLOCKED" : "FLAGGED";
    notification.create({
      type: "compliance_alert",
      shipment_id: shipmentId,
      recipient: "compliance-team",
      subject: `Compliance ${level}: ${rule.description}`,
      body: details,
    });
  });

  events.on("document:created", (doc) => {
    notification.create({
      type: "document_ready",
      shipment_id: doc.shipment_id,
      recipient: "stakeholders",
      subject: `Document ready: ${doc.title || doc.type}`,
      body: `Document '${doc.title || doc.type}' generated for shipment ${doc.shipment_id}`,
    });
  });
}

module.exports = { start };
