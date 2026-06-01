const { auditLog } = require("@global-logistics/core/models");

function logger(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const method = req.method;
    const path = req.originalUrl || req.url;
    if (path.startsWith("/api/") && method !== "GET") {
      const userId = req.user?.id || null;
      const resourceType = path.split("/")[3] || "unknown";
      auditLog.create({
        user_id: userId,
        action: `${method} ${path}`,
        resource_type: resourceType,
        details: { body: sanitize(req.body), statusCode: res.statusCode },
        ip_address: req.ip,
      });
    }
    return originalJson(body);
  };
  next();
}

function sanitize(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = { ...obj };
  delete clone.password;
  delete clone.password_hash;
  delete clone.token;
  delete clone.secret;
  return clone;
}

module.exports = { logger };
