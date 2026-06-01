const express = require("express");
const path = require("path");
const http = require("http");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { WebSocketServer } = require("ws");
const { events, getDb } = require("@global-logistics/core/db");
const auth = require("@global-logistics/auth");
const { logger } = require("@global-logistics/audit");
const Joi = require("joi");

const shipments = require("./routes/shipments");
const compliance = require("./routes/compliance");
const documents = require("./routes/documents");
const notifications = require("./routes/notifications");
const visibility = require("./routes/visibility");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const webhookRoutes = require("./routes/webhooks");
const exportRoutes = require("./routes/exports");
const bulkRoutes = require("./routes/bulk");

function createApp() {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors());
  app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false }));
  app.use(express.json({ limit: "5mb" }));
  app.use(auth.middleware);
  app.use(logger);

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "Global Logistics & Supply Chain Mesh", version: "1.0.0" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/shipments", shipments);
  app.use("/api/compliance", compliance);
  app.use("/api/documents", documents);
  app.use("/api/notifications", notifications);
  app.use("/api/visibility", visibility);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/export", exportRoutes);
  app.use("/api/bulk", bulkRoutes);

  app.get("/api/network", (req, res) => {
    try {
      const p2p = require("@global-logistics/p2p-network");
      const n = p2p.getNode();
      if (!n || !n.running) return res.json({ running: false, nodeId: null, port: null, peers: [], peerCount: 0 });
      res.json({ running: true, nodeId: n.nodeId, port: n.port, peers: n.getPeers(), peerCount: n.getPeerCount() });
    } catch { res.json({ running: false, nodeId: null, port: null, peers: [], peerCount: 0 }); }
  });

  app.get("/api/search", (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ shipments: [], documents: [], notifications: [] });
    const db = getDb();
    const like = `%${q}%`;
    const shipments_ = db.prepare("SELECT id, reference, origin, destination, status FROM shipments WHERE reference LIKE ? OR origin LIKE ? OR destination LIKE ? OR cargo_description LIKE ? LIMIT 20")
      .all(like, like, like, like);
    const docs = db.prepare("SELECT id, shipment_id, type, title FROM documents WHERE title LIKE ? OR type LIKE ? LIMIT 10").all(like, like);
    const notifs = db.prepare("SELECT id, type, subject FROM notifications WHERE subject LIKE ? OR body LIKE ? LIMIT 10").all(like, like);
    res.json({ shipments: shipments_, documents: docs, notifications: notifs });
  });

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "Internal server error" });
  });

  const frontendPath = path.join(__dirname, "..", "web-frontend", "public");
  app.use(express.static(frontendPath));

  return app;
}

function startServer(port = 0) {
  const app = createApp();
  const server = http.createServer(app);

  const wss = new WebSocketServer({ server });
  const clients = new Set();
  wss.on("connection", (ws) => { clients.add(ws); ws.on("close", () => clients.delete(ws)); ws.on("error", () => clients.delete(ws)); });

  const broadcastWS = (type, data) => {
    const msg = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const ws of clients) { if (ws.readyState === 1) ws.send(msg); }
  };

  events.on("shipment:tracking", (event) => broadcastWS("tracking_event", event));
  events.on("compliance:alert", (payload) => broadcastWS("compliance_alert", payload));
  events.on("document:created", (doc) => broadcastWS("document_created", doc));

  // Webhook dispatcher
  events.on("shipment:tracking", async (event) => {
    const webhookModel = require("@global-logistics/core/models/webhook");
    const whs = webhookModel.all(true).filter(w => w.events.includes("shipment:tracking") || w.events.includes("*"));
    for (const wh of whs) {
      try {
        const res = await fetch(wh.url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "shipment:tracking", data: event, timestamp: new Date().toISOString() }),
        });
        const body = await res.text();
        webhookModel.recordDelivery(wh.id, "shipment:tracking", event, res.ok ? "success" : "failed", res.status, body);
      } catch (e) {
        webhookModel.recordDelivery(wh.id, "shipment:tracking", event, "failed", null, e.message);
      }
    }
  });

  events.on("compliance:alert", async (payload) => {
    const webhookModel = require("@global-logistics/core/models/webhook");
    const whs = webhookModel.all(true).filter(w => w.events.includes("compliance:alert") || w.events.includes("*"));
    for (const wh of whs) {
      try {
        const res = await fetch(wh.url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "compliance:alert", data: payload, timestamp: new Date().toISOString() }),
        });
        const body = await res.text();
        webhookModel.recordDelivery(wh.id, "compliance:alert", payload, res.ok ? "success" : "failed", res.status, body);
      } catch (e) {
        webhookModel.recordDelivery(wh.id, "compliance:alert", payload, "failed", null, e.message);
      }
    }
  });

  return { app, server, broadcastWS, wss };
}

module.exports = { createApp, startServer };
