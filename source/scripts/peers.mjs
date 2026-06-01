import { spawn } from "child_process";
import { createServer } from "net";

const PEERS = [
  { name: "seed", PORT: 4000, P2P_PORT: 5001, P2P_PEERS: "" },
  { name: "peer-1", PORT: 4001, P2P_PORT: 5002, P2P_PEERS: "localhost:5001" },
  { name: "peer-2", PORT: 4002, P2P_PORT: 5003, P2P_PEERS: "localhost:5001" },
];

const children = [];

async function portFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.on("error", () => resolve(false));
    srv.listen(port, () => { srv.close(); resolve(true); });
  });
}

function killAll() {
  console.log("\nStopping all peers...");
  for (const proc of children) proc.kill();
}

process.on("SIGINT", () => { killAll(); process.exit(0); });
process.on("SIGTERM", () => { killAll(); process.exit(0); });

async function main() {
  for (const p of PEERS) {
    const free = await portFree(p.PORT);
    if (!free) {
      console.error(`Port ${p.PORT} already in use — skipping ${p.name}`);
      continue;
    }
    const env = { ...process.env, PORT: String(p.PORT), P2P_PORT: String(p.P2P_PORT) };
    if (p.P2P_PEERS) env.P2P_PEERS = p.P2P_PEERS;

    const proc = spawn("node", ["source/index.js"], {
      env,
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });

    children.push(proc);

    proc.on("exit", (code) => {
      console.log(`[${p.name}] exited with code ${code}`);
    });

    console.log(`Started ${p.name} → http://localhost:${p.PORT} (P2P :${p.P2P_PORT})`);
  }

  console.log("\nAll peers launched. Press Ctrl+C to stop all.\n");
}

main().catch(console.error);
