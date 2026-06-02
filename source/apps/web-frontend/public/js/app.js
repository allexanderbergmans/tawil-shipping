const APP = {
  user: null,
  token: null,
  ws: null,
  wsReconnectTimer: null,
  unreadCount: 0,
  loadingCount: 0,
  refreshEnabled: true,

  formatCurrency(v) {
    if (v == null || isNaN(v)) return "$0.00";
    return "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  init() {
    this.token = localStorage.getItem("glm_token");
    const userData = localStorage.getItem("glm_user");
    if (userData) { try { this.user = JSON.parse(userData); } catch { this.user = null; } }
    if (this.token) document.body.classList.add("authenticated");
    this.setupLoadingBar();
    this.setupSidebar();
    this.setupSearch();
    this.setupTabs();
    this.setupModals();
    this.setupToastClose();
    this.setupShortcuts();
    this.setupDarkMode();
    this.setupRefreshIndicator();
    this.loadUnreadCount();
    this.connectWS();
  },

  /* ── Auth ── */
  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem("glm_token", token);
    localStorage.setItem("glm_user", JSON.stringify(user));
    document.body.classList.add("authenticated");
  },
  clearAuth() {
    this.token = null; this.user = null;
    localStorage.removeItem("glm_token"); localStorage.removeItem("glm_user");
    document.body.classList.remove("authenticated");
  },
  isLoggedIn() { return !!this.token; },
  isAdmin() { return this.user?.role === "admin"; },
  isOperator() { return this.user?.role === "operator" || this.user?.role === "admin"; },
  async checkAuth() {
    if (!this.token) { this.clearAuth(); return false; }
    try {
      const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer " + this.token } });
      if (!res.ok) { this.clearAuth(); return false; }
      const data = await res.json();
      this.user = data.user;
      localStorage.setItem("glm_user", JSON.stringify(this.user));
      return true;
    } catch { return false; }
  },

  renderNav() {
    const links = document.querySelectorAll(".sidebar-nav a");
    if (!links.length) return;
    // Inject Optimizer link if not present
    const nav = document.querySelector(".sidebar-nav");
    if (nav && !nav.querySelector('a[href="/optimizer.html"]')) {
      const optLink = document.createElement("a");
      optLink.href = "/optimizer.html";
      optLink.textContent = "Route Optimizer";
      optLink.dataset.search = "true";
      if (location.pathname === "/optimizer.html") optLink.className = "active";
      // Insert before Documents
      const docsLink = nav.querySelector('a[href="/documents.html"]');
      if (docsLink && docsLink.parentNode) nav.insertBefore(optLink, docsLink.nextSibling);
      else nav.appendChild(optLink);
    }
    if (this.isAdmin()) {
      const nav = document.querySelector(".sidebar-nav");
      if (nav) {
        const navHTML = Array.from(nav.querySelectorAll("a")).map(a => a.outerHTML).join("");
        const extra = [];
        extra.push(`<a href="/admin.html"${location.pathname === "/admin.html" ? ' class="active"' : ''}>Admin</a>`);
        extra.push(`<a href="/webhooks.html"${location.pathname === "/webhooks.html" ? ' class="active"' : ''}>Webhooks</a>`);
        var notifIdx = navHTML.indexOf('/notifications.html');
        if (notifIdx === -1) {
          nav.innerHTML = navHTML + extra.join("");
        }
      }
    }
    // Dark mode toggle
    const nav = document.querySelector(".sidebar-nav");
    if (nav && !nav.querySelector(".dark-toggle-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "dark-toggle-wrap";
      wrap.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 12px;margin-top:4px;border-top:1px solid var(--gray-700);font-size:13px;color:var(--gray-400)";
      wrap.innerHTML = '<span style="flex:1">Dark mode</span><label class="toggle"><input type="checkbox" id="darkModeToggle"><span class="slider"></span></label>';
      const accBtn = document.createElement("button");
      accBtn.textContent = "🎨 Theme";
      accBtn.style.cssText = "background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:12px;padding:4px 8px;border-radius:4px;font-family:inherit";
      accBtn.addEventListener("click", () => APP.showAccentPicker());
      wrap.appendChild(accBtn);
      // Insert before logout if it exists, otherwise append
      const logout = nav.querySelector(".logout-link");
      if (logout) nav.insertBefore(wrap, logout);
      else nav.appendChild(wrap);
    }
    if (this.isLoggedIn()) {
      if (nav && !nav.querySelector(".logout-link")) {
        const logout = document.createElement("a");
        logout.href = "#";
        logout.className = "logout-link";
        logout.style.cssText = "margin-top:auto;border-top:1px solid var(--gray-700);padding-top:12px;margin-top:12px";
        logout.textContent = "Logout (" + (this.user?.username || "?") + ")";
        logout.addEventListener("click", (e) => {
          e.preventDefault();
          this.clearAuth();
          location.href = "/login.html";
        });
        nav.appendChild(logout);
      }
    }
  },

  /* ── Sidebar ── */
  setupSidebar() {
    const hamburger = document.getElementById("hamburger");
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".sidebar-overlay");
    if (!sidebar) return;
    function closeSidebar() { sidebar.classList.remove("open"); overlay?.classList.remove("active"); }
    if (hamburger) hamburger.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      if (overlay) overlay.classList.toggle("active");
    });
    if (overlay) overlay.addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSidebar();
    });
  },

  /* ── Search (Ctrl+K) ── */
  setupSearch() {
    const input = document.getElementById("globalSearch");
    if (!input) return;
    const results = document.getElementById("searchResults");
    let activeIdx = -1;
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        input.focus();
      }
    });
    if (results) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { results.classList.remove("active"); results.innerHTML = ""; return; }
        const items = document.querySelectorAll("[data-search]");
        let groups = {};
        items.forEach(el => {
          const text = (el.textContent || "").toLowerCase();
          if (text.includes(q)) {
            const parent = el.closest("[data-search-group]");
        const group = el.dataset.searchGroup || parent?.dataset.searchGroup || "General";
            if (!groups[group]) groups[group] = [];
            groups[group].push(el.cloneNode(true));
          }
        });
        let html = "";
        const keys = Object.keys(groups);
        if (keys.length === 0) {
          html = '<div class="sr-item" style="color:var(--gray-400)">No results</div>';
        } else {
          keys.forEach(g => {
            html += '<div class="sr-group">' + g + '</div>';
            groups[g].slice(0, 8).forEach(el => {
              html += '<div class="sr-item" data-href="' + (el.getAttribute("href") || "#") + '">' + el.textContent + "</div>";
            });
          });
        }
        results.innerHTML = html;
        results.classList.add("active");
        activeIdx = -1;
        results.querySelectorAll(".sr-item").forEach((el, i) => {
          el.addEventListener("click", () => {
            const href = el.dataset.href;
            if (href && href !== "#") location.href = href;
          });
        });
      });
      input.addEventListener("keydown", (e) => {
        const items = results.querySelectorAll(".sr-item");
        if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); highlightItem(items, activeIdx); }
        if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlightItem(items, activeIdx); }
        if (e.key === "Enter" && activeIdx >= 0) { items[activeIdx]?.click(); }
        if (e.key === "Escape") { results.classList.remove("active"); input.blur(); }
      });
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-wrapper")) results.classList.remove("active");
      });
      function highlightItem(items, idx) {
        items.forEach((el, i) => { el.style.background = i === idx ? "var(--primary-light)" : ""; });
      }
    }
  },

  /* ── Tabs ── */
  setupTabs() {
    document.querySelectorAll(".tabs").forEach(tabGroup => {
      const tabs = tabGroup.querySelectorAll(".tab");
      const contents = tabGroup.parentElement.querySelectorAll(".tab-content");
      tabs.forEach(tab => {
        tab.addEventListener("click", () => {
          tabs.forEach(t => t.classList.remove("active"));
          tab.classList.add("active");
          const target = tab.dataset.tab;
          contents.forEach(c => {
            c.classList.toggle("active", c.id === target || c.dataset.tab === target);
          });
        });
      });
    });
  },

  /* ── Modals ── */
  setupModals() {
    document.addEventListener("click", (e) => {
      const overlay = e.target.closest(".modal-overlay");
      if (overlay && e.target === overlay) overlay.classList.remove("active");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));
      }
    });
  },
  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
  },
  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
  },

  /* ── Toasts ── */
  setupToastClose() {
    document.addEventListener("click", (e) => {
      const close = e.target.closest(".toast-close");
      if (close) {
        const toast = close.closest(".toast");
        toast.style.animation = "slideIn 0.25s ease reverse";
        setTimeout(() => toast?.remove(), 280);
      }
    });
  },
  toast(title, text = "", type = "info") {
    const icons = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
    const icon = icons[type] || icons.info;
    const container = document.getElementById("toast-container");
    if (!container) return;
    this.playSound(type);
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = '<div class="toast-icon">' + icon + '</div><div class="toast-body"><div class="toast-title">' + title + '</div>' + (text ? '<div class="toast-text">' + text + "</div>" : "") + '</div><span class="toast-close">×</span>';
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = "slideIn 0.25s ease reverse";
      setTimeout(() => el.remove(), 280);
    }, 4000);
  },

  /* ── Confirm Dialog ── */
  confirm(msg, sub = "", type = "question") {
    return new Promise(resolve => {
      const id = "confirm-" + Date.now();
      const icons = { question: "❓", warning: "⚠️", danger: "🚫", info: "ℹ️" };
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay active";
      overlay.id = id;
      overlay.innerHTML = '<div class="modal" style="max-width:420px"><div class="confirm-body"><div class="icon">' + (icons[type] || icons.question) + '</div><div class="msg">' + msg + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : "") + '</div><div class="confirm-actions"><button class="btn btn-primary" id="' + id + '-ok">Confirm</button><button class="btn" id="' + id + '-cancel">Cancel</button></div></div>';
      document.body.appendChild(overlay);
      document.getElementById(id + "-ok").addEventListener("click", () => { overlay.remove(); resolve(true); });
      document.getElementById(id + "-cancel").addEventListener("click", () => { overlay.remove(); resolve(false); });
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    });
  },

  /* ── Copy utility ── */
  async copy(text, label = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      this.toast(label, text.length > 50 ? text.slice(0, 50) + "..." : text, "success");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); ta.remove();
      this.toast(label, "", "success");
    }
  },

  /* ── Loading Bar ── */
  setupLoadingBar() {
    if (document.getElementById("loading-bar")) return;
    const bar = document.createElement("div");
    bar.id = "loading-bar";
    bar.innerHTML = '<div class="bar"></div>';
    document.body.appendChild(bar);
  },
  showLoading() {
    this.loadingCount++;
    const bar = document.getElementById("loading-bar");
    if (bar && this.loadingCount > 0) bar.classList.add("loading");
    // Safety: auto-hide after 20s no matter what
    if (this._loadingSafetyTimer) clearTimeout(this._loadingSafetyTimer);
    this._loadingSafetyTimer = setTimeout(() => {
      this.loadingCount = 0;
      const bar = document.getElementById("loading-bar");
      if (bar) bar.classList.remove("loading");
    }, 20000);
  },
  hideLoading() {
    this.loadingCount = Math.max(0, this.loadingCount - 1);
    const bar = document.getElementById("loading-bar");
    if (bar && this.loadingCount === 0) {
      bar.classList.remove("loading");
      if (this._loadingSafetyTimer) clearTimeout(this._loadingSafetyTimer);
    }
  },

  /* ── Keyboard Shortcuts ── */
  setupShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.target.closest("input,textarea,select")) {
        e.preventDefault();
        this.showShortcuts();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        this.showShortcuts();
      }
    });
    const hints = [
      ["Ctrl+K / ⌘K", "Search"],
      ["Ctrl+/", "Keyboard shortcuts"],
      ["?", "Keyboard shortcuts"],
      ["Escape", "Close modal / sidebar"],
      ["↑ ↓ Enter", "Navigate search results"],
    ];
    const modalId = "shortcuts-modal";
    const existing = document.getElementById(modalId);
    if (!existing) {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.id = modalId;
      overlay.innerHTML = '<div class="modal" style="max-width:480px"><h3>Keyboard Shortcuts</h3><div class="kbd-grid">' + hints.map(h => '<kbd>' + h[0] + '</kbd><div class="kdesc">' + h[1] + '</div>').join("") + '</div><div class="modal-actions"><button class="btn btn-primary" id="shortcuts-close">Got it</button></div></div>';
      document.body.appendChild(overlay);
      document.getElementById("shortcuts-close").addEventListener("click", () => this.closeModal(modalId));
    }
  },
  showShortcuts() {
    this.openModal("shortcuts-modal");
  },

  /* ── Dark mode ── */
  setupDarkMode() {
    const stored = localStorage.getItem("glm_dark");
    if (stored === "true" || (!stored && window.matchMedia?.("(prefers-color-scheme: dark)").matches)) {
      document.body.classList.add("dark");
    }
    const toggle = document.getElementById("darkModeToggle");
    if (toggle) {
      toggle.checked = document.body.classList.contains("dark");
      toggle.addEventListener("change", () => {
        document.body.classList.toggle("dark", toggle.checked);
        localStorage.setItem("glm_dark", toggle.checked);
      });
    }
  },

  /* ── Auto-refresh ── */
  setupRefreshIndicator() {
    this.refreshEnabled = localStorage.getItem("glm_refresh") !== "false";
    let el = document.getElementById("refreshIndicator");
    if (!el) {
      const wsEl = document.getElementById("wsStatus");
      if (wsEl && wsEl.parentElement) {
        el = document.createElement("span");
        el.id = "refreshIndicator";
        el.className = "refresh-indicator";
        wsEl.parentElement.insertBefore(el, wsEl.nextSibling);
      }
    }
    if (!el) return;
    el.className = "refresh-indicator " + (this.refreshEnabled ? "live" : "paused");
    el.textContent = this.refreshEnabled ? "Auto-refresh on" : "Paused";
    el.title = "Click to toggle auto-refresh";
    el.addEventListener("click", () => {
      this.refreshEnabled = !this.refreshEnabled;
      localStorage.setItem("glm_refresh", this.refreshEnabled);
      el.className = "refresh-indicator " + (this.refreshEnabled ? "live" : "paused");
      el.textContent = this.refreshEnabled ? "Auto-refresh on" : "Paused";
      document.dispatchEvent(new CustomEvent("refresh:toggle", { detail: { enabled: this.refreshEnabled } }));
    });
  },

  /* ── Unread count / badges ── */
  async loadUnreadCount() {
    if (!this.isLoggedIn()) return;
    try {
      const res = await fetch("/api/notifications?unread=true&limit=1", { headers: { Authorization: "Bearer " + this.token } });
      if (res.ok) {
        const data = await res.json();
        this.unreadCount = data.total || 0;
        this.updateBadge();
      }
    } catch {}
  },
  updateBadge() {
    document.querySelectorAll(".sidebar-nav a[href*='notifications']").forEach(a => {
      let badge = a.querySelector(".nav-badge");
      if (this.unreadCount > 0) {
        if (!badge) { badge = document.createElement("span"); badge.className = "nav-badge"; a.appendChild(badge); }
        badge.textContent = this.unreadCount > 99 ? "99+" : this.unreadCount;
      } else if (badge) { badge.remove(); }
    });
  },

  /* ── Skeleton helpers ── */
  showSkeleton(container, lines = 3) {
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) return;
    el.dataset.skel = "1";
    el.innerHTML = '<div class="skeleton skeleton-block"></div>'.repeat(lines);
  },
  hideSkeleton(container) {
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) return;
    el.dataset.skel = "0";
    el.innerHTML = "";
  },

  /* ── WebSocket ── */
  connectWS() {
    if (!this.isLoggedIn() || this.ws) return;
    try {
      this.ws = new WebSocket((location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws?token=" + this.token);
      this.ws.onopen = () => {
        this.updateWSStatus(true);
        if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
      };
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "notification") {
            this.unreadCount++;
            this.updateBadge();
            this.toast(msg.title || "New Notification", msg.message, "info");
            if (msg.severity === "critical" || msg.severity === "high") this.playSound("error");
          }
          document.dispatchEvent(new CustomEvent("ws:message", { detail: msg }));
        } catch {}
      };
      this.ws.onclose = () => {
        this.updateWSStatus(false);
        this.ws = null;
        this.wsReconnectTimer = setTimeout(() => this.connectWS(), 5000);
      };
      this.ws.onerror = () => { this.ws?.close(); };
    } catch { this.updateWSStatus(false); }
  },
  updateWSStatus(connected) {
    const el = document.getElementById("wsStatus");
    if (!el) return;
    el.className = "ws-status " + (connected ? "connected" : "disconnected");
    el.textContent = connected ? "Connected" : "Disconnected";
  },

  /* ── Utility ── */
  async api(path, opts = {}) {
    opts.headers = opts.headers || {};
    if (this.token) opts.headers.Authorization = "Bearer " + this.token;
    opts.headers["Content-Type"] = opts.headers["Content-Type"] || "application/json";
    const base = opts.baseUrl || "";
    const timeout = opts.timeout || 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    opts.signal = controller.signal;
    this.showLoading();
    try {
      const res = await fetch(base + path, opts);
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    } finally {
      this.hideLoading();
    }
  },
  formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },
  pluralize(count, singular, plural) { return count === 1 ? singular : (plural || singular + "s"); },
  debounce(fn, ms = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; },

  /* ── Pagination ── */
  renderPagination(container, total, page, limit, onPage, onLimit) {
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) return;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { el.innerHTML = ""; return; }
    let html = '<div class="pagination"><div class="pg-btns">';
    const range = 2;
    const start = Math.max(1, page - range);
    const end = Math.min(totalPages, page + range);
    if (page > 1) html += '<button class="btn btn-sm" data-page="' + (page - 1) + '">← Prev</button>';
    for (let i = start; i <= end; i++) {
      html += '<button class="btn btn-sm' + (i === page ? ' btn-primary' : '') + '" data-page="' + i + '">' + i + '</button>';
    }
    if (page < totalPages) html += '<button class="btn btn-sm" data-page="' + (page + 1) + '">Next →</button>';
    html += '</div>';
    html += '<div class="pg-info">' + page + '/' + totalPages + ' (' + total + ')</div>';
    if (onLimit) {
      const sizes = [10, 15, 25, 50, 100];
      html += '<span class="rows-per-page">Rows: <select id="rowsPerPage">' + sizes.map(s => '<option value="' + s + '"' + (s === limit ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></span>';
    }
    html += '</div>';
    el.innerHTML = html;
    el.querySelectorAll("[data-page]").forEach(btn => {
      btn.addEventListener("click", () => onPage(parseInt(btn.dataset.page)));
    });
    const sel = el.querySelector("#rowsPerPage");
    if (sel) sel.addEventListener("change", () => onLimit(parseInt(sel.value)));
  },

  /* ── Sortable tables ── */
  makeSortable(tableEl, onSort) {
    if (!tableEl) return;
    tableEl.querySelectorAll("th").forEach((th, idx) => {
      const text = th.textContent.trim();
      if (!text || th.querySelector("input[type=checkbox]")) return;
      th.classList.add("sortable");
      th.dataset.sortIdx = idx;
      th.addEventListener("click", () => {
        const isAsc = th.classList.contains("asc");
        tableEl.querySelectorAll("th").forEach(h => h.classList.remove("asc", "desc"));
        th.classList.add(isAsc ? "desc" : "asc");
        if (onSort) onSort(idx, isAsc ? "desc" : "asc");
      });
    });
  },

  /* ── Export modal ── */
  showExport(title, fields, onExport) {
    const id = "export-modal-" + Date.now();
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.id = id;
    overlay.innerHTML = '<div class="modal" style="max-width:520px"><h3>Export ' + title + '</h3>'
      + '<div class="form-group"><label>Format</label><select id="' + id + '-format"><option value="csv">CSV</option><option value="json">JSON</option></select></div>'
      + '<label style="font-size:12px;font-weight:600;color:var(--gray-700)">Fields</label>'
      + '<div class="export-fields" id="' + id + '-fields">' + fields.map(f => '<label><input type="checkbox" value="' + f.value + '" checked>' + f.label + '</label>').join("") + '</div>'
      + '<div class="modal-actions"><button class="btn btn-primary" id="' + id + '-go">Export</button><button class="btn" id="' + id + '-cancel">Cancel</button></div></div>';
    document.body.appendChild(overlay);
    document.getElementById(id + "-cancel").addEventListener("click", () => overlay.remove());
    document.getElementById(id + "-go").addEventListener("click", () => {
      const format = document.getElementById(id + "-format").value;
      const selected = Array.from(document.querySelectorAll("#" + id + "-fields input:checked")).map(el => el.value);
      overlay.remove();
      if (onExport) onExport(format, selected);
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  },

  /* ── Notification sound ── */
  soundEnabled: localStorage.getItem("glm_sound") !== "false",
  playSound(type = "info") {
    if (!this.soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.value = 0.1;
      if (type === "success") { osc.frequency.value = 800; osc.type = "sine"; gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); osc.start(); osc.stop(ctx.currentTime + 0.15); }
      else if (type === "error") { osc.frequency.value = 300; osc.type = "sawtooth"; gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); osc.start(); osc.stop(ctx.currentTime + 0.3); }
      else if (type === "warning") { osc.frequency.value = 500; osc.type = "triangle"; osc.start(); osc.stop(ctx.currentTime + 0.2); }
      else { osc.frequency.value = 600; osc.type = "sine"; gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); osc.start(); osc.stop(ctx.currentTime + 0.1); }
    } catch {}
  },
  toggleSound() { this.soundEnabled = !this.soundEnabled; localStorage.setItem("glm_sound", this.soundEnabled); },

  /* ── Recent searches ── */
  saveSearch(q) {
    if (!q || q.length < 2) return;
    let recents = JSON.parse(localStorage.getItem("glm_recent_searches") || "[]");
    recents = recents.filter(s => s !== q);
    recents.unshift(q);
    if (recents.length > 5) recents = recents.slice(0, 5);
    localStorage.setItem("glm_recent_searches", JSON.stringify(recents));
  },
  getRecentSearches() {
    return JSON.parse(localStorage.getItem("glm_recent_searches") || "[]");
  },
  showRecentSearches(container, onSelect) {
    if (!container) return;
    const recents = this.getRecentSearches();
    if (recents.length === 0) { container.innerHTML = ""; container.style.display = "none"; return; }
    container.style.display = "block";
    container.innerHTML = "Recent: " + recents.map(s => '<span data-q="' + s.replace(/"/g, "&quot;") + '">' + s + '</span>').join("");
    container.querySelectorAll("[data-q]").forEach(el => {
      el.addEventListener("click", () => { if (onSelect) onSelect(el.dataset.q); });
    });
  },

  /* ── Column visibility toggle ── */
  makeColumnsToggleable(tableId, storageKey) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const ths = table.querySelectorAll("thead th");
    if (ths.length === 0) return;
    const key = storageKey || ("cols_" + tableId);
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    const cols = [];
    const menu = document.createElement("div");
    menu.className = "col-menu";
    ths.forEach((th, i) => {
      const text = th.textContent.trim();
      if (!text || th.querySelector("input[type=checkbox]")) return;
      const visible = saved.length ? saved.includes(text) : true;
      cols.push({ text, visible, idx: i });
      const label = document.createElement("label");
      label.innerHTML = '<input type="checkbox" ' + (visible ? "checked" : "") + '> ' + text;
      label.querySelector("input").addEventListener("change", (e) => {
        const colIdx = i;
        cols.find(c => c.idx === colIdx).visible = e.target.checked;
        this._applyColumnVisibility(table, cols, key);
      });
      menu.appendChild(label);
    });
    ths[0].parentElement.appendChild(menu);
    ths.forEach((th, i) => {
      const col = cols.find(c => c.idx === i);
      if (col && !col.visible) {
        th.style.display = "none";
        table.querySelectorAll("tbody tr, thead tr").forEach(tr => {
          const td = tr.children[i];
          if (td) td.style.display = "none";
        });
      }
    });
    // Toggle menu on header right-click
    table.querySelector("thead").addEventListener("contextmenu", (e) => {
      e.preventDefault();
      menu.style.top = e.clientY + "px";
      menu.style.left = e.clientX + "px";
      menu.classList.toggle("active");
    });
    document.addEventListener("click", () => menu.classList.remove("active"));
    this._colMenus = this._colMenus || [];
    this._colMenus.push(menu);
  },
  _applyColumnVisibility(table, cols, key) {
    const visibleCols = cols.filter(c => c.visible).map(c => c.text);
    localStorage.setItem(key, JSON.stringify(visibleCols));
    cols.forEach(col => {
      const display = col.visible ? "" : "none";
      const th = table.querySelectorAll("thead th")[col.idx];
      if (th) th.style.display = display;
      table.querySelectorAll("tbody tr").forEach(tr => {
        const td = tr.children[col.idx];
        if (td) td.style.display = display;
      });
    });
  },

  /* ── Risk score badge ── */
  riskBadge(score) {
    let level = "low", label = "Low";
    if (score >= 80) { level = "critical"; label = "Critical"; }
    else if (score >= 60) { level = "high"; label = "High"; }
    else if (score >= 30) { level = "medium"; label = "Medium"; }
    return '<span class="risk-badge ' + level + '">' + label + ' (' + score + ')</span>';
  },

  /* ── Document preview modal ── */
  showDocumentPreview(id, title) {
    APP.api("/api/documents/" + id).then(doc => {
      if (!doc || !doc.content) { APP.toast("Document not found", "", "error"); return; }
      const content = doc.content;
      const html = '<div class="doc-preview">' + content + '</div>';
      APP.openModal({ title: title || doc.name || "Document Preview", content: html, size: "large" });
    }).catch(() => APP.toast("Failed to load document", "", "error"));
  },

  /* ── Recent SLA breaches (dashboard) ── */
  loadBreaches(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    APP.api("/api/sla/breaches?limit=5").then(data => {
      const list = data && data.length ? data : (data && data.rows ? data.rows : []);
      if (!list.length) { el.innerHTML = '<div class="text-muted" style="padding:8px">No recent breaches</div>'; return; }
      el.innerHTML = list.map(b => '<div class="breach-card"><div class="breach-title">' + (b.shipment_ref || b.shipment_id || "N/A") + '</div><div>' + (b.rule_name || b.rule || "") + '</div><div class="breach-meta">' + new Date(b.breached_at || b.created_at).toLocaleString() + '</div></div>').join("");
    }).catch(() => el.innerHTML = '<div class="text-muted" style="padding:8px">Failed to load breaches</div>');
  },

  /* ── Activity stream filter ── */
  renderActivityFilters(container, active, onChange) {
    const el = typeof container === "string" ? document.querySelector(container) : container;
    if (!el) return;
    const types = ["all", "shipment", "document", "compliance", "export", "notification", "sla"];
    el.innerHTML = types.map(t => '<button class="afilter' + (t === active ? " active" : "") + '" data-type="' + t + '">' + t.charAt(0).toUpperCase() + t.slice(1) + '</button>').join("");
    el.querySelectorAll(".afilter").forEach(btn => {
      btn.addEventListener("click", () => { onChange(btn.dataset.type); el.querySelectorAll(".afilter").forEach(b => b.classList.toggle("active", b === btn)); });
    });
  },

  /* ── Rows per page preference ── */
  get rowsPerPagePref() {
    return parseInt(localStorage.getItem("rowsPerPage")) || 15;
  },
  set rowsPerPagePref(val) {
    localStorage.setItem("rowsPerPage", String(val));
  },

  /* ── Favorites / bookmarks (localStorage) ── */
  get favorites() {
    try { return JSON.parse(localStorage.getItem("favorites") || "[]"); } catch { return []; }
  },
  set favorites(arr) {
    localStorage.setItem("favorites", JSON.stringify(arr));
  },
  toggleFavorite(id) {
    let favs = this.favorites;
    const idx = favs.indexOf(id);
    if (idx >= 0) { favs.splice(idx, 1); } else { favs.push(id); }
    this.favorites = favs;
    return idx < 0;
  },
  isFavorite(id) { return this.favorites.includes(id); },

  /* ── Notification preferences (which types fire toast/sound) ── */
  get notifPrefs() {
    try { return JSON.parse(localStorage.getItem("notifPrefs") || '{"error":true,"warning":true,"info":true,"success":true,"critical":true}'); } catch { return {}; }
  },
  set notifPrefs(obj) {
    localStorage.setItem("notifPrefs", JSON.stringify(obj));
  },
  shouldNotify(severity) { return this.notifPrefs[severity] !== false; },

  /* ── Copy utility (click ref to copy) ── */
  copyRef(text, label) {
    this.copy(text, label || "Reference copied");
  },

  /* ── Expandable table row ── */
  makeRowsExpandable(table, getDetailHTML) {
    table.querySelectorAll("tbody tr").forEach(tr => {
      tr.style.cursor = "pointer";
      tr.addEventListener("click", (e) => {
        if (e.target.closest("a,button,input,select,textarea")) return;
        const next = tr.nextElementSibling;
        if (next && next.classList.contains("expanded-row")) {
          next.remove();
          tr.classList.remove("expanded");
          return;
        }
        tr.classList.add("expanded");
        const detail = document.createElement("tr");
        detail.className = "expanded-row";
        const td = document.createElement("td");
        td.colSpan = table.querySelector("thead tr").children.length;
        td.innerHTML = getDetailHTML(tr);
        detail.appendChild(td);
        tr.after(detail);
      });
    });
  },

  /* ── Accent color picker ── */
  get accentColor() { return localStorage.getItem("accentColor") || "#2563eb"; },
  set accentColor(c) {
    localStorage.setItem("accentColor", c);
    document.documentElement.style.setProperty("--primary", c);
  },
  showAccentPicker() {
    const colors = ["#2563eb","#059669","#dc2626","#7c3aed","#d97706","#0891b2","#be185d","#1f2937"];
    const cur = this.accentColor;
    const html = '<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:12px">' +
      colors.map(c => '<div style="width:40px;height:40px;border-radius:8px;background:' + c + ';cursor:pointer;border:' + (c === cur ? '3px solid var(--gray-900)' : '3px solid transparent') + '" data-color="' + c + '" onclick="APP.setAccent(\'' + c + '\')"></div>').join('') +
      '<div style="flex:0 0 100%;text-align:center;margin-top:8px"><label style="font-size:12px;color:var(--gray-400)">Custom: <input type="color" id="accentPicker" value="' + cur + '" onchange="APP.setAccent(this.value)" style="width:60px;height:40px;border:none;cursor:pointer;background:none"></label></div></div>';
    APP.openModal({ title: "Accent Color", content: html, size: "small" });
  },
  setAccent(c) {
    this.accentColor = c;
    document.querySelectorAll("[data-color]").forEach(el => el.style.border = (el.dataset.color === c ? '3px solid var(--gray-900)' : '3px solid transparent'));
  },

  /* ── Shipment notes (localStorage) ── */
  getShipmentNotes(id) { try { const n = JSON.parse(localStorage.getItem("shipNotes") || "{}"); return n[id] || ""; } catch { return ""; } },
  setShipmentNotes(id, text) {
    try { const n = JSON.parse(localStorage.getItem("shipNotes") || "{}"); n[id] = text; localStorage.setItem("shipNotes", JSON.stringify(n)); } catch {}
  },

  /* ── Data quality score ── */
  dataQuality(s) {
    if (!s) return { score: 0, total: 0, filled: 0 };
    const fields = ["reference","origin","destination","cargo_value","shipper_name","consignee_name","cargo_description","weight_kg","port_of_loading","port_of_discharge"];
    const filled = fields.filter(f => s[f] != null && s[f] !== "").length;
    return { score: Math.round(filled / fields.length * 100), total: fields.length, filled };
  },

  /* ── Simple delay-risk heuristic ── */
  delayRisk(from, to) {
    const riskLanes = [
      { from: "ningbo", to: "rotterdam", risk: "high" },
      { from: "shanghai", to: "hamburg", risk: "high" },
      { from: "singapore", to: "los angeles", risk: "medium" },
      { from: "rotterdam", to: "new york", risk: "medium" },
      { from: "dubai", to: "mombasa", risk: "high" },
    ];
    const f = (from || "").toLowerCase(), t = (to || "").toLowerCase();
    const match = riskLanes.find(r => f.includes(r.from) && t.includes(r.to));
    return match ? match.risk : "low";
  },

  /* ── Gantt-style timeline ── */
  renderGantt(containerId, events) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el || !events.length) return;
    const times = events.map(e => new Date(e.timestamp).getTime()).filter(t => !isNaN(t));
    if (times.length === 0) { el.innerHTML = '<div class="text-muted">No timed events</div>'; return; }
    const minT = Math.min(...times), maxT = Math.max(...times), span = maxT - minT || 1;
    const statusColors = { pending: "#f59e0b", in_transit: "#3b82f6", delivered: "#10b981", delayed: "#ef4444", customs_hold: "#8b5cf6", cleared: "#059669", exception: "#dc2626", approved: "#10b981" };
    let html = '<div style="position:relative;padding:4px 0;min-height:40px;overflow-x:auto">';
    events.forEach(e => {
      const t = new Date(e.timestamp).getTime();
      if (isNaN(t)) return;
      const pct = ((t - minT) / span) * 100;
      const color = statusColors[e.status] || "#6b7280";
      html += '<div style="position:relative;margin:2px 0;padding:2px 0;font-size:11px;white-space:nowrap">';
      html += '<span style="position:absolute;left:' + pct + '%;width:10px;height:10px;border-radius:50%;background:' + color + ';top:50%;transform:translate(-50%,-50%);z-index:2"></span>';
      html += '<span style="margin-left:' + (pct + 2) + '%;color:var(--gray-600)">' + (e.status || "").replace(/_/g, " ") + ' — ' + new Date(e.timestamp).toLocaleString() + '</span>';
      html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
  },

  /* ── Pulse animation helper (network health) ── */
  pulse(el) { el.classList.add("pulsing"); setTimeout(() => el.classList.remove("pulsing"), 1500); },

  /* ════════════════════════════════════════════════════════════════
     INTERNAL FEATURES — computational / functional utilities
     ════════════════════════════════════════════════════════════════ */

  /* ── Route Optimizer ── */
  async findRoutes(origin, destination, weightKg) {
    try {
      const res = await APP.api("/api/optimize?origin=" + encodeURIComponent(origin) + "&destination=" + encodeURIComponent(destination) + (weightKg ? "&weight=" + weightKg : ""));
      return res || [];
    } catch { return []; }
  },

  renderRouteComparison(containerId, routes) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    if (!routes || !routes.length) { el.innerHTML = '<div class="text-muted">No routes found.</div>'; return; }
    const best = routes[0];
    let html = '<table class="table" style="font-size:12px"><thead><tr><th>Mode</th><th>Transit</th><th>Cost</th><th>CO₂</th><th>Reliability</th><th></th></tr></thead><tbody>';
    routes.forEach(r => {
      const isBest = r === best;
      html += '<tr' + (isBest ? ' style="background:var(--success-light, #def7ec)"' : '') + '>';
      html += '<td><strong>' + (r.mode || "").toUpperCase() + '</strong></td>';
      html += '<td>' + (r.transit_days || r.transitDays || "—") + ' days</td>';
      html += '<td>' + APP.formatCurrency(r.total_cost || r.totalCost || 0) + '</td>';
      html += '<td>' + (r.total_co2 || r.totalCO2 || 0).toFixed(1) + ' kg</td>';
      html += '<td>' + (r.reliability != null ? (r.reliability * 100).toFixed(0) + '%' : '—') + '</td>';
      html += '<td>' + (isBest ? '<span class="badge green">Recommended</span>' : '') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  },

  /* ── Carbon Calculator (client-side, mirrors backend formula) ── */
  carbonEstimate(origin, destination, weightKg, mode) {
    const emissionFactors = { sea: 0.015, air: 0.85, road: 0.12, rail: 0.028 };
    const distances = {
      "ningbo→rotterdam": 10500, "shanghai→hamburg": 9800, "singapore→los angeles": 7100,
      "rotterdam→new york": 3400, "dubai→mombasa": 2400, "shenzhen→long beach": 6200,
      "hamburg→new york": 3700, "shanghai→rotterdam": 10400, "mumbai→london": 6300,
      "rotterdam→singapore": 8300,
    };
    const key = ((origin || "") + "→" + (destination || "")).toLowerCase();
    const dist = distances[key] || 5000;
    const ef = emissionFactors[mode] || 0.015;
    const co2Kg = dist * ((weightKg || 1000) / 1000) * ef;
    const co2Tonnes = co2Kg / 1000;
    const offsetCost = co2Tonnes * 15;
    const equivKm = co2Kg / 0.25;
    return { co2Kg: Math.round(co2Kg), co2Tonnes: Math.round(co2Tonnes * 100) / 100, offsetCost: Math.round(offsetCost * 100) / 100, equivalentKmDriven: Math.round(equivKm), distanceKm: dist, emissionFactor: ef };
  },

  /* ── SLA Penalty Analyzer ── */
  async loadSLAPenalties(containerId) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    try {
      const breaches = await APP.api("/api/sla/breaches?limit=100");
      const list = breaches && breaches.length ? breaches : (breaches && breaches.rows ? breaches.rows : []);
      if (!list.length) { el.innerHTML = '<div class="text-muted">No breaches found.</div>'; return; }
      const totalPenalty = list.reduce((s, b) => s + (b.penalty || 0), 0);
      const byRule = {};
      list.forEach(b => {
        const r = b.rule_name || "unknown";
        byRule[r] = byRule[r] || { count: 0, penalty: 0 };
        byRule[r].count++;
        byRule[r].penalty += b.penalty || 0;
      });
      let html = '<div style="font-size:13px;margin-bottom:8px"><strong>' + list.length + '</strong> breaches, <strong>' + APP.formatCurrency(totalPenalty) + '</strong> total penalties</div>';
      html += '<table class="table" style="font-size:12px"><thead><tr><th>Rule</th><th>Breaches</th><th>Penalty</th></tr></thead><tbody>';
      Object.entries(byRule).sort((a, b) => b[1].penalty - a[1].penalty).forEach(([rule, d]) => {
        html += '<tr><td>' + rule + '</td><td>' + d.count + '</td><td>' + APP.formatCurrency(d.penalty) + '</td></tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="text-muted">Failed to load penalties.</div>'; }
  },

  /* ── Trade Lane Health ── */
  async loadLaneHealth(containerId) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    try {
      const lanes = await APP.api("/api/trade-lanes");
      if (!lanes || !lanes.length) { el.innerHTML = '<div class="text-muted">No lane data.</div>'; return; }
      let html = '<table class="table" style="font-size:12px"><thead><tr><th>Lane</th><th>Shipments</th><th>Completion</th><th>Issues</th><th>Health</th><th>Avg Value</th></tr></thead><tbody>';
      lanes.slice(0, 20).forEach(l => {
        const health = l.health || (l.issue_rate != null ? (l.issue_rate < 10 ? "good" : l.issue_rate < 30 ? "fair" : "poor") : "—");
        const healthClass = health === "good" ? "green" : health === "fair" ? "yellow" : "red";
        html += '<tr><td>' + (l.origin || "?") + ' → ' + (l.destination || "?") + '</td><td>' + (l.shipment_count || l.count || 0) + '</td><td>' + (l.completion_rate != null ? (l.completion_rate * 100).toFixed(0) + '%' : '—') + '</td><td>' + (l.issue_count || l.issues || 0) + '</td><td><span class="badge ' + healthClass + '">' + health + '</span></td><td>' + APP.formatCurrency(l.avg_value || l.averageValue || 0) + '</td></tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="text-muted">Failed to load lanes.</div>'; }
  },

  /* ── Telemetry Alert Hub ── */
  async loadTelemetryAlerts(containerId) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    try {
      const alerts = await APP.api("/api/telemetry/alerts");
      if (!alerts || !alerts.length) { el.innerHTML = '<div class="text-muted">No active telemetry alerts.</div>'; return; }
      const bySeverity = { critical: [], warning: [], info: [] };
      alerts.forEach(a => { const s = a.severity || "warning"; bySeverity[s] ? bySeverity[s].push(a) : (bySeverity[s] = [a]); });
      const order = ["critical", "warning", "info"];
      let html = '<div style="font-size:13px;margin-bottom:8px"><strong>' + alerts.length + '</strong> active alerts';
      order.forEach(s => { if (bySeverity[s] && bySeverity[s].length) html += ' · <span style="color:' + (s === "critical" ? "var(--danger)" : s === "warning" ? "var(--warning)" : "var(--gray-400)") + '">' + bySeverity[s].length + ' ' + s + '</span>'; });
      html += '</div>';
      order.forEach(s => {
        if (!bySeverity[s] || !bySeverity[s].length) return;
        bySeverity[s].slice(0, 5).forEach(a => {
          html += '<div class="breach-card" style="border-left-color:' + (s === "critical" ? "var(--danger)" : s === "warning" ? "var(--warning)" : "var(--gray-400)") + '">';
          html += '<div class="breach-title">' + (a.sensor || "Sensor") + ': ' + (a.message || "Alert") + '</div>';
          html += '<div class="breach-meta">Shipment ' + (a.shipment_id || "").slice(0, 8) + '… | ' + new Date(a.created_at).toLocaleString() + '</div>';
          html += '</div>';
        });
        if (bySeverity[s].length > 5) html += '<div class="text-muted" style="font-size:11px;padding:2px 0 6px">+' + (bySeverity[s].length - 5) + ' more</div>';
      });
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="text-muted">Failed to load alerts.</div>'; }
  },

  /* ── Compliance Health Score ── */
  async loadComplianceHealth(containerId) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    try {
      const summary = await APP.api("/api/visibility/compliance-summary");
      if (!summary) { el.innerHTML = '<div class="text-muted">No compliance data.</div>'; return; }
      const byResult = summary.byResult || [];
      const total = byResult.reduce((s, r) => s + r.count, 0);
      const passes = byResult.find(r => r.result === "pass");
      const failures = byResult.find(r => r.result === "fail");
      const flags = byResult.find(r => r.result === "flag");
      const passCount = passes ? passes.count : 0;
      const failCount = failures ? failures.count : 0;
      const flagCount = flags ? flags.count : 0;
      const passRate = total > 0 ? (passCount / total * 100).toFixed(1) : 0;
      const health = passRate >= 90 ? "good" : passRate >= 70 ? "fair" : "poor";
      let html = '<div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">';
      html += '<div style="width:60px;height:60px;border-radius:50%;background:' + (health === "good" ? "var(--success)" : health === "fair" ? "var(--warning)" : "var(--danger)") + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:16px">' + passRate + '%</div>';
      html += '<div><div style="font-size:13px">' + total + ' total checks</div>';
      html += '<div style="font-size:11px;color:var(--gray-400)">' + passCount + ' pass · ' + failCount + ' fail · ' + flagCount + ' flag</div></div></div>';
      if (summary.byRule && summary.byRule.length) {
        html += '<table class="table" style="font-size:11px"><thead><tr><th>Rule Type</th><th>Count</th></tr></thead><tbody>';
        summary.byRule.forEach(r => { html += '<tr><td>' + r.type + '</td><td>' + r.count + '</td></tr>'; });
        html += '</tbody></table>';
      }
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="text-muted">Failed to load compliance health.</div>'; }
  },

  /* ── Shipment Consolidation Finder ── */
  async findConsolidations(containerId) {
    const el = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    if (!el) return;
    try {
      const shipments = await APP.api("/api/shipments?limit=500");
      const list = shipments.data || [];
      const groups = {};
      list.forEach(s => {
        const key = (s.origin || "?") + "→" + (s.destination || "?");
        groups[key] = groups[key] || [];
        groups[key].push(s);
      });
      const candidates = Object.entries(groups).filter(([, sh]) => sh.length >= 2).sort((a, b) => b[1].length - a[1].length);
      if (!candidates.length) { el.innerHTML = '<div class="text-muted">No consolidation candidates found.</div>'; return; }
      let html = '<div style="font-size:13px;margin-bottom:8px"><strong>' + candidates.length + '</strong> lanes with 2+ shipments</div>';
      html += '<table class="table" style="font-size:12px"><thead><tr><th>Lane</th><th>Shipments</th><th>Total Value</th><th>Weight</th></tr></thead><tbody>';
      candidates.slice(0, 15).forEach(([lane, sh]) => {
        const totalVal = sh.reduce((s, x) => s + (x.cargo_value || 0), 0);
        const totalWt = sh.reduce((s, x) => s + (x.weight_kg || 0), 0);
        html += '<tr><td><strong>' + lane + '</strong></td><td>' + sh.length + '</td><td>' + APP.formatCurrency(totalVal) + '</td><td>' + (totalWt ? totalWt.toFixed(0) + ' kg' : '—') + '</td></tr>';
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    } catch { el.innerHTML = '<div class="text-muted">Failed to analyze.</div>'; }
  },
};

APP.init();
