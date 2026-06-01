const WS = (() => {
  let ws = null;
  let reconnectTimer = null;
  let listeners = [];

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    try {
      ws = new WebSocket(proto + "//" + location.host);
    } catch { scheduleReconnect(); return; }

    ws.onopen = () => {
      document.querySelectorAll(".ws-status").forEach(el => { el.textContent = "Live"; el.className = "ws-status connected"; });
    };

    ws.onclose = () => {
      document.querySelectorAll(".ws-status").forEach(el => { el.textContent = "Offline"; el.className = "ws-status disconnected"; });
      scheduleReconnect();
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        for (const fn of listeners) fn(msg);
        showToast(msg);
      } catch {}
    };

    ws.onerror = () => {};
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 5000);
  }

  function showToast(msg) {
    const icons = { tracking_event: "📍", compliance_alert: "⚠️", document_created: "📄" };
    const labels = { tracking_event: "Tracking Update", compliance_alert: "Compliance Alert", document_created: "Document Created" };
    const colors = { tracking_event: "#3b82f6", compliance_alert: "#ef4444", document_created: "#10b981" };

    const container = document.getElementById("toast-container") || (() => {
      const c = document.createElement("div");
      c.id = "toast-container";
      document.body.appendChild(c);
      return c;
    })();

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.cssText = `border-left:4px solid ${colors[msg.type] || "#6b7280"}`;
    toast.innerHTML = `<div class="toast-icon">${icons[msg.type] || "📢"}</div><div class="toast-body"><div class="toast-title">${labels[msg.type] || msg.type}</div><div class="toast-text">${truncate(JSON.stringify(msg.data), 80)}</div></div><div class="toast-close" onclick="this.parentElement.remove()">×</div>`;
    container.appendChild(toast);

    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
  }

  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n) + "…";
  }

  function onMessage(fn) { listeners.push(fn); }

  connect();
  return { connect, onMessage };
})();
