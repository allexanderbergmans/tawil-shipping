const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const { startServer } = require("@global-logistics/api-gateway");
const notifEngine = require("@global-logistics/notification-engine");
const p2p = require("@global-logistics/p2p-network");

notifEngine.start();

const P2P_PORT = parseInt(process.env.P2P_PORT) || 0;
const P2P_PEERS = process.env.P2P_PEERS ? process.env.P2P_PEERS.split(",") : [];
const P2P_ADDRESS = process.env.P2P_ADDRESS || "";

if (P2P_PORT || P2P_PEERS.length > 0) {
  p2p.start({ port: P2P_PORT, peers: P2P_PEERS, advertisedAddress: P2P_ADDRESS });
}

const { server } = startServer();
const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`Global Logistics & Supply Chain Mesh — API Gateway on :${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  if (P2P_PORT) console.log(`P2P node active on port ${P2P_PORT} (${p2p.getNode().nodeId})`);
});
