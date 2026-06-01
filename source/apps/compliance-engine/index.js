const { compliance, notification } = require("@global-logistics/core/models");

function runChecks(shipmentId) {
  const results = compliance.checkAllRules(shipmentId);
  const failures = results.filter(r => r.result === "fail");
  const flags = results.filter(r => r.result === "flag");

  if (failures.length > 0) {
    notification.create({
      type: "compliance_alert",
      shipment_id: shipmentId,
      recipient: "compliance-team",
      subject: `Compliance FAILURE — ${failures.length} rule(s) blocked`,
      body: `Shipment ${shipmentId} failed ${failures.length} compliance checks. Review required.`,
    });
  } else if (flags.length > 0) {
    notification.create({
      type: "compliance_alert",
      shipment_id: shipmentId,
      recipient: "compliance-team",
      subject: `Compliance FLAG — ${flags.length} rule(s) need review`,
      body: `Shipment ${shipmentId} flagged ${flags.length} rules for manual review.`,
    });
  }

  return { passed: failures.length === 0, failures, flags, total: results.length };
}

function getResults(shipmentId) {
  return compliance.resultsByShipment(shipmentId);
}

function getRules(type) {
  return compliance.getRules(type);
}

module.exports = { runChecks, getResults, getRules };
