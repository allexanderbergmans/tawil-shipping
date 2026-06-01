const APP = {
  user: null,
  token: null,
  init() {
    this.token = localStorage.getItem("glm_token");
    const userData = localStorage.getItem("glm_user");
    if (userData) { try { this.user = JSON.parse(userData); } catch { this.user = null; } }
    if (this.token) document.body.classList.add("authenticated");
  },
  setAuth(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem("glm_token", token);
    localStorage.setItem("glm_user", JSON.stringify(user));
    document.body.classList.add("authenticated");
  },
  clearAuth() {
    this.token = null;
    this.user = null;
    localStorage.removeItem("glm_token");
    localStorage.removeItem("glm_user");
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
    if (this.isAdmin()) {
      const nav = links[0]?.closest(".sidebar-nav") || document.querySelector(".sidebar-nav");
      const adminLink = document.createElement("a");
      adminLink.href = "/admin.html";
      adminLink.textContent = "Admin";
      if (location.pathname === "/admin.html") adminLink.className = "active";
      const whLink = document.createElement("a");
      whLink.href = "/webhooks.html";
      whLink.textContent = "Webhooks";
      if (location.pathname === "/webhooks.html") whLink.className = "active";
      const notifLink = nav.querySelector('a[href="/notifications.html"]');
      if (notifLink) {
        notifLink.insertAdjacentElement("afterend", whLink);
        whLink.insertAdjacentElement("afterend", adminLink);
      }
    }
    if (this.isLoggedIn()) {
      const nav = document.querySelector(".sidebar-nav");
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
};

APP.init();
