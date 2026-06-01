const dashboard = require("@global-logistics/visibility-dashboard");
const { fmtCurrency, table } = require("../lib/format");

function run() {
  const ov = dashboard.overview();
  const stats = [
    ["Total Shipments", String(ov.total)],
    ["In Transit", String(ov.inTransit)],
    ["Pending Compliance Alerts", String(ov.pendingCompliance)],
    ["Total Cargo Value", fmtCurrency(ov.totalValue)],
  ];
  console.log("\n\x1b[1mSupply Chain Overview\x1b[0m\n");
  console.log(table(["Metric", "Value"], stats));

  const bn = dashboard.bottlenecks();
  if (bn.length > 0) {
    console.log("\n\x1b[1mBottlenecks\x1b[0m\n");
    console.log(table(["Location", "Events", "Shipments"], bn.map(b => [b.location, String(b.events), String(b.shipments)])));
  }

  const act = dashboard.recentActivity(5);
  if (act.length > 0) {
    console.log("\n\x1b[1mRecent Activity\x1b[0m");
    const { statusBadge, fmtDate } = require("../lib/format");
    for (const e of act) {
      console.log(`  ${fmtDate(e.timestamp)}  ${statusBadge(e.status)}  ${e.location || ""}`);
    }
  }
  console.log();
}

module.exports = { run };
