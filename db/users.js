const db = require('./index');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function create({ name, email, passwordHash }) {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), passwordHash);
  return findById(result.lastInsertRowid);
}

function updateName(id, name) {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
  return findById(id);
}

function updatePasswordHash(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

module.exports = { findByEmail, findById, create, updateName, updatePasswordHash };
