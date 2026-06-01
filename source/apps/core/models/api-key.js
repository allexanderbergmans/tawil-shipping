const { getDb } = require("../db");
const crypto = require("crypto");

function generateKey() {
  return "glm_" + crypto.randomBytes(24).toString("hex");
}

const all = (userId) => {
  return getDb().prepare("SELECT id, user_id, name, last_used_at, is_active, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC").all(userId);
};

const create = (userId, name) => {
  const db = getDb();
  const id = "key_" + crypto.randomBytes(8).toString("hex");
  const key = generateKey();
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  db.prepare("INSERT INTO api_keys (id, user_id, name, key_hash) VALUES (?,?,?,?)").run(id, userId, name, hash);
  return { id, name, key, created_at: new Date().toISOString() };
};

const validate = (key) => {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const apiKey = getDb().prepare("SELECT ak.*, u.role FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = ? AND ak.is_active = 1 AND u.is_active = 1").get(hash);
  if (apiKey) {
    getDb().prepare("UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?").run(apiKey.id);
  }
  return apiKey || null;
};

const remove = (id) => {
  getDb().prepare("DELETE FROM api_keys WHERE id = ?").run(id);
};

module.exports = { all, create, validate, remove, generateKey };
