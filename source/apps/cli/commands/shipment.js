const tracker = require("@global-logistics/shipment-tracker");
const { statusBadge, fmtDate, fmtCurrency, table } = require("../lib/format");
const readline = require("readline");

function rl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(query) {
  return new Promise(resolve => {
    const i = rl();
    i.question(query + " ", a => { i.close(); resolve(a); });
  });
}

async function list(opts) {
  const filters = {};
  if (opts.status) filters.status = opts.status;
  if (opts.origin) filters.origin = opts.origin;
  if (opts.destination) filters.destination = opts.destination;

  const list = tracker.listShipments(filters);
  if (list.length === 0) {
    console.log("\n  No shipments found.\n");
    return;
  }

  const rows = list.map(s => [
    s.reference || s.id.slice(0, 12),
    s.origin,
    s.destination,
    statusBadge(s.status),
    fmtCurrency(s.cargo_value),
    fmtDate(s.created_at),
  ]);
  console.log("\n" + table(["Ref", "Origin", "Dest", "Status", "Value", "Created"], rows) + "\n");
}

async function create() {
  const fields = [
    "origin", "destination", "cargo_description", "cargo_value",
    "shipper_name", "shipper_country", "consignee_name", "consignee_country",
    "port_of_loading", "port_of_discharge", "estimated_departure", "estimated_arrival",
  ];
  const data = {};
  for (const f of fields) {
    const val = await ask(f.replace(/_/g, " ") + ":");
    if (val) data[f] = val;
  }
  try {
    const s = tracker.createShipment(data);
    console.log(`\n  Created shipment \x1b[32m${s.reference}\x1b[0m (\x1b[90m${s.id}\x1b[0m)\n`);
  } catch (e) {
    console.error(`\n  \x1b[31mError:\x1b[0m ${e.message}\n`);
  }
}

async function get(id) {
  const s = tracker.getShipment(id);
  if (!s) { console.log("\n  Shipment not found.\n"); return; }
  console.log(`
  \x1b[1m${s.reference}\x1b[0m  ${statusBadge(s.status)}
  Origin:      ${s.origin}
  Destination: ${s.destination}
  Cargo:       ${s.cargo_description || "—"}  (${fmtCurrency(s.cargo_value)})
  Shipper:     ${s.shipper_name || "—"} (${s.shipper_country || "—"})
  Consignee:   ${s.consignee_name || "—"} (${s.consignee_country || "—"})
  Ports:       ${s.port_of_loading || "—"} → ${s.port_of_discharge || "—"}
  Est:         ${fmtDate(s.estimated_departure)} → ${fmtDate(s.estimated_arrival)}
  Created:     ${fmtDate(s.created_at)}
`);

  if (s.tracking_events && s.tracking_events.length > 0) {
    console.log("  \x1b[1mTracking Timeline\x1b[0m");
    for (const e of s.tracking_events) {
      console.log(`    ${fmtDate(e.timestamp)}  ${statusBadge(e.status)}  ${e.location || ""}`);
      if (e.description) console.log(`    \x1b[90m${e.description}\x1b[0m`);
    }
    console.log();
  }
}

async function updateStatus(id, status, opts) {
  const s = tracker.updateShipmentStatus(id, status, { location: opts.location });
  if (!s) { console.log("\n  Shipment not found.\n"); return; }
  console.log(`\n  Status updated to ${statusBadge(status)}\n`);
}

async function track(id) {
  const status = await ask("Status (e.g. departed, arrived, customs_hold):");
  const location = await ask("Location:");
  const description = await ask("Description:");
  try {
    tracker.recordTrackingEvent({ shipment_id: id, status, location, description });
    console.log(`\n  Tracking event recorded.\n`);
  } catch (e) {
    console.error(`\n  \x1b[31mError:\x1b[0m ${e.message}\n`);
  }
}

module.exports = { list, create, get, updateStatus, track };
