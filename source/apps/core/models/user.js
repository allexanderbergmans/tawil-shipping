const { getDb } = require("../db");
const crypto = require("crypto");

const all = () => getDb().prepare("SELECT id, username, email, role, is_active, created_at FROM users ORDER BY created_at DESC").all();

const getById = (id) => getDb().prepare("SELECT id, username, email, role, is_active, created_at FROM users WHERE id = ?").get(id);

const getByUsername = (username) => getDb().prepare("SELECT * FROM users WHERE username = ?").get(username);

const getByEmail = (email) => getDb().prepare("SELECT id, username, email, role, is_active, created_at FROM users WHERE email = ?").get(email);

const create = (data) => {
  const bcrypt = require("bcryptjs");
  const db = getDb();
  const id = "usr_" + crypto.randomBytes(8).toString("hex");
  const hash = bcrypt.hashSync(data.password, 10);
  db.prepare("INSERT INTO users (id, username, email, password_hash, role) VALUES (?,?,?,?,?)")
    .run(id, data.username, data.email, hash, data.role || "operator");
  return getById(id);
};

const verifyPassword = (plainText, hash) => {
  const bcrypt = require("bcryptjs");
  return bcrypt.compareSync(plainText, hash);
};

module.exports = { all, getById, getByUsername, getByEmail, create, verifyPassword };
