const fs = require('node:fs');
const path = require('node:path');
const db = require('./index');
const documents = require('./documents');
const PASTA_UPLOADS = require('./uploads-dir');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Usado no painel de admin - lista todo mundo cadastrado, sem o hash de senha.
function listAll() {
  return db
    .prepare(
      'SELECT id, name, email, created_at, last_login_at FROM users ORDER BY name COLLATE NOCASE'
    )
    .all();
}

function create({ name, email, passwordHash, secretQuestion, secretAnswerHash }) {
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, secret_question, secret_answer_hash)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name.trim(), email.toLowerCase().trim(), passwordHash, secretQuestion, secretAnswerHash);
  return findById(result.lastInsertRowid);
}

function updateName(id, name) {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
  return findById(id);
}

function updatePasswordHash(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function updateLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
}

function updateProfile(id, { studyArea, university, academicBackground }) {
  db.prepare(
    'UPDATE users SET study_area = ?, university = ?, academic_background = ? WHERE id = ?'
  ).run(studyArea || null, university || null, academicBackground || null, id);
  return findById(id);
}

// Antes de gravar o caminho novo, apaga o arquivo da foto antiga (se tinha
// uma) - limpeza best-effort, mesmo padrao ja usado em documents.remove.
function updateAvatarPath(id, novoPath) {
  const usuario = findById(id);
  if (usuario && usuario.avatar_path) {
    fs.rm(path.join(PASTA_UPLOADS, usuario.avatar_path), { force: true }, () => {});
  }
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(novoPath, id);
  return findById(id);
}

// Apaga o usuario e tudo que pertence a ele. Reaproveita documents.remove
// (que ja cuida de apagar trechos, codigos e arquivos em disco de cada
// documento) em vez de duplicar essa limpeza aqui.
function remove(id) {
  const usuario = findById(id);
  if (usuario && usuario.avatar_path) {
    fs.rm(path.join(PASTA_UPLOADS, usuario.avatar_path), { force: true }, () => {});
  }
  const documentosDoUsuario = db.prepare('SELECT id FROM documents WHERE user_id = ?').all(id);
  documentosDoUsuario.forEach((doc) => documents.remove(doc.id, id));
  db.prepare('DELETE FROM articles WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  findByEmail,
  findById,
  listAll,
  create,
  updateName,
  updatePasswordHash,
  updateLastLogin,
  updateProfile,
  updateAvatarPath,
  remove,
};
