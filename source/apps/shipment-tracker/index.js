const { shipment, trackingEvent } = require("@global-logistics/core/models");

function createShipment(data) {
  const s = shipment.create(data);
  trackingEvent.create({
    shipment_id: s.id,
    status: "created",
    location: data.origin,
    description: `Shipment created at ${data.origin}`,
  });
  return s;
}

function recordTrackingEvent(data) {
  const event = trackingEvent.create(data);
  const latest = trackingEvent.latestByShipment(data.shipment_id);
  if (latest) {
    shipment.updateStatus(data.shipment_id, latest.status === "delivered" ? "delivered" : "in_transit");
  }
  return event;
}

function listShipments(filters) {
  return shipment.all(filters);
}

function countShipments(filters) {
  return shipment.count(filters);
}

function getShipment(id) {
  const s = shipment.getById(id);
  if (!s) return null;
  s.tracking_events = trackingEvent.byShipment(id);
  return s;
}

function updateShipmentStatus(id, status, extras) {
  const s = shipment.updateStatus(id, status, extras);
  if (s) {
    trackingEvent.create({
      shipment_id: id,
      status,
      location: extras.location || s.destination,
      description: `Status updated to: ${status}`,
    });
  }
  return s;
}

module.exports = { createShipment, recordTrackingEvent, listShipments, countShipments, getShipment, updateShipmentStatus };
