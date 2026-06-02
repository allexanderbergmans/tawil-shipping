const WebSocket = require("ws");
const crypto = require("crypto");
const { createMessage, parseMessage } = require("./protocol");
const { EventEmitter } = require("events");

class P2PNode extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.opts = opts;
    this.nodeId = opts.nodeId || "node_" + crypto.randomBytes(6).toString("hex");
    this.port = opts.port || 0;
    this.bootstrapPeers = opts.peers || []; // ["host:port", ...]
    this.peers = new Map(); // "nodeId" → { ws, address, connectedAt }
    this.addrToNodeId = new Map(); // "host:port" → nodeId
    this.server = null;
    this.running = false;
    this.pingInterval = null;
    this._pendingQueries = new Map();
  }

  start() {
    if (this.running) return;
    this.running = true;

    this.server = new WebSocket.Server({ port: this.port });
    this.port = this.server.address().port;

    console.log(`[P2P] Node ${this.nodeId} listening on port ${this.port}`);

    this.server.on("connection", (ws, req) => {
      const remoteAddr = req.socket.remoteAddress + ":" + req.socket.remotePort;
      this._handleConnection(ws, remoteAddr);
    });

    this.server.on("error", (err) => {
      console.error(`[P2P] Server error: ${err.message}`);
      this.emit("error", err);
    });

    this.pingInterval = setInterval(() => this._pingPeers(), 15000);

    for (const peerAddr of this.bootstrapPeers) {
      this.connect(peerAddr);
    }

    this.emit("started", { nodeId: this.nodeId, port: this.port });
    return this;
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    for (const [id, peer] of this.peers) {
      peer.ws.close();
    }
    this.peers.clear();
    this.addrToNodeId.clear();
    if (this.server) this.server.close();
    this.emit("stopped");
  }

  connect(address) {
    if (this.addrToNodeId.has(address)) return;
    if (address.endsWith(":" + this.port)) return;

    const ws = new WebSocket("ws://" + address);
    ws.on("open", () => {
      this._handleConnection(ws, address, true);
      this._send(ws, "peer_discover", { address: this.address(), nodeId: this.nodeId });
    });
    ws.on("error", () => {
      this.addrToNodeId.delete(address);
    });
  }

  _handleConnection(ws, address, isOutbound = false) {
    ws.on("message", (data) => {
      const msg = parseMessage(data);
      if (!msg) return;
      this._handleMessage(msg, ws);
    });

    ws.on("close", () => {
      for (const [id, peer] of this.peers) {
        if (peer.ws === ws) {
          this.peers.delete(id);
          this.emit("peer_disconnected", { nodeId: id });
          break;
        }
      }
      for (const [addr, id] of this.addrToNodeId) {
        if (id && !this.peers.has(id)) this.addrToNodeId.delete(addr);
      }
    });

    ws.on("error", () => {});

    this._send(ws, "ping", {});
  }

  _handleMessage(msg, ws) {
    switch (msg.type) {
      case "ping":
        this._send(ws, "pong", {});
        break;

      case "pong":
        break;

      case "peer_discover": {
        const addr = msg.payload.address;
        const nodeId = msg.payload.nodeId;

        this._send(ws, "peer_discover", {
          address: this.address(),
          nodeId: this.nodeId,
        });

        if (nodeId && !this.peers.has(nodeId)) {
          this.peers.set(nodeId, { ws, address: addr, connectedAt: new Date() });
          if (addr) this.addrToNodeId.set(addr, nodeId);
          this.emit("peer_connected", { nodeId, address: addr });
          console.log(`[P2P] Peer connected: ${nodeId} @ ${addr}`);
          this._send(ws, "peer_list", { peers: this.getPeerAddresses() });
        }

        if (addr && !this.addrToNodeId.has(addr) && addr !== this.address()) {
          this.connect(addr);
        }
        break;
      }

      case "peer_list": {
        const remotePeers = msg.payload.peers || [];
        for (const addr of remotePeers) {
          if (!this.addrToNodeId.has(addr) && addr !== this.address()) {
            this.connect(addr);
          }
        }
        break;
      }

      case "tracking_event":
        this.emit("message:tracking_event", msg.payload, msg.from);
        break;

      case "compliance_alert":
        this.emit("message:compliance_alert", msg.payload, msg.from);
        break;

      case "document_shared":
        this.emit("message:document_shared", msg.payload, msg.from);
        break;

      case "shipment_query": {
        const { trackingEvent, shipment } = require("@global-logistics/core/models");
        const s = shipment.getById(msg.payload.shipment_id);
        if (s) {
          s.tracking_events = trackingEvent.byShipment(s.id);
          this._send(ws, "shipment_response", { queryId: msg.id, shipment: s });
        }
        break;
      }

      case "shipment_response":
        this.emit("message:shipment_response", msg.payload);
        break;

      case "db_snapshot_request":
        this.emit("message:db_snapshot_request", msg.payload, msg.from);
        break;

      case "db_snapshot_chunk":
        this.emit("message:db_snapshot_chunk", msg.payload, msg.from);
        break;

      case "db_row_sync":
        this.emit("message:db_row_sync", msg.payload, msg.from);
        break;

      case "db_sync_ack":
        this.emit("message:db_sync_ack", msg.payload, msg.from);
        break;
    }
  }

  broadcast(type, payload) {
    for (const [id, peer] of this.peers) {
      this._send(peer.ws, type, payload);
    }
  }

  sendToPeer(nodeId, type, payload) {
    const peer = this.peers.get(nodeId);
    if (peer) this._send(peer.ws, type, payload);
  }

  queryShipment(shipmentId, timeout = 5000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { resolve(null); this._pendingQueries.delete(shipmentId); }, timeout);
      this._pendingQueries.set(shipmentId, { resolve, timer });
      this.broadcast("shipment_query", { shipment_id: shipmentId });

      this.once("message:shipment_response", (payload) => {
        if (payload.queryId && this._pendingQueries.has(shipmentId)) {
          const q = this._pendingQueries.get(shipmentId);
          clearTimeout(q.timer);
          this._pendingQueries.delete(shipmentId);
          resolve(payload.shipment);
        }
      });
    });
  }

  _send(ws, type, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      const msg = createMessage(type, payload);
      const parsed = JSON.parse(msg);
      parsed.from = this.nodeId;
      ws.send(JSON.stringify(parsed));
    }
  }

  _pingPeers() {
    for (const [id, peer] of this.peers) {
      if (peer.ws.readyState !== WebSocket.OPEN) {
        this.peers.delete(id);
        this.emit("peer_disconnected", { nodeId: id });
      }
    }
  }

  getPeerAddresses() {
    return Array.from(this.addrToNodeId.keys());
  }

  getPeerCount() {
    return this.peers.size;
  }

  getPeers() {
    return Array.from(this.peers.entries()).map(([id, p]) => ({
      nodeId: id,
      address: p.address,
      connectedAt: p.connectedAt,
    }));
  }

  address() {
    const host = this.opts && this.opts.advertisedAddress ? this.opts.advertisedAddress : "127.0.0.1";
    return host + ":" + this.port;
  }
}

module.exports = { P2PNode };
