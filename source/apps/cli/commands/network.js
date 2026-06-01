const p2p = require("@global-logistics/p2p-network");
const { table } = require("../lib/format");

async function status() {
  const node = p2p.getNode();
  if (!node || !node.running) {
    console.log("\n  P2P network is not active. Set P2P_PORT or P2P_PEERS env vars.\n");
    return;
  }
  console.log(`\n  \x1b[1mNode ID:\x1b[0m ${node.nodeId}`);
  console.log(`  \x1b[1mPort:\x1b[0m   ${node.port}`);
  console.log(`  \x1b[1mPeers:\x1b[0m  ${node.getPeerCount()} connected\n`);

  const peers = node.getPeers();
  if (peers.length > 0) {
    console.log(table(["Node ID", "Address", "Connected"],
      peers.map(p => [p.nodeId || "unknown", p.address, new Date(p.connectedAt).toLocaleString()])
    ) + "\n");
  }
}

async function connect(addr) {
  const node = p2p.getNode();
  if (!node) { console.log("\n  P2P not active.\n"); return; }
  node.connect(addr);
  console.log(`\n  Connecting to ${addr}...\n`);
}

module.exports = { status, connect };
