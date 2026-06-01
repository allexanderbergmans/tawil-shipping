const API_BASE = "/api";

async function api(path, options = {}) {
  const url = API_BASE + path;
  const headers = { "Content-Type": "application/json", ...options.headers };

  const app = typeof APP !== "undefined" ? APP : null;
  const token = (app && app.token) || localStorage.getItem("glm_token");
  if (token) headers["Authorization"] = "Bearer " + token;

  const config = { headers };
  if (options.body) config.body = JSON.stringify(options.body);
  if (options.method) config.method = options.method;

  const res = await fetch(url, config);
  if (res.status === 401 && app) {
    app.clearAuth();
    if (!location.pathname.includes("login.html")) location.href = "/login.html";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  if (options.raw) return res;
  return res.json();
}

function statusBadge(status) {
  const colors = {
    pending: "yellow", in_transit: "blue", cleared: "green",
    delivered: "green", delayed: "red", exception: "red", created: "gray",
  };
  const color = colors[status] || "gray";
  return `<span class="badge ${color}">${status.replace(/_/g, " ")}</span>`;
}

function formatDate(d) {
  if (!d) return "\u2014";
  if (typeof d === "string" && !d.endsWith("Z") && !d.includes("+") && !d.includes("T")) d += "Z";
  return new Date(d).toLocaleString();
}

function formatCurrency(v) {
  if (!v) return "\u2014";
  return "$" + Number(v).toLocaleString();
}
