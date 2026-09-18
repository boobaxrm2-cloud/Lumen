const fs = require('node:fs');
const path = require('node:path');
const db = require('./index');
const PASTA_UPLOADS = require('./uploads-dir');

function listByDocument(documentId, userId) {
  return db
    .prepare(
      'SELECT * FROM highlights WHERE document_id = ? AND user_id = ? ORDER BY datetime(created_at) DESC'
    )
    .all(documentId, userId);
}

function countByDocument(documentId) {
  const linha = db
    .prepare('SELECT COUNT(*) AS total FROM highlights WHERE document_id = ?')
    .get(documentId);
  return linha.total;
}

// Todos os trechos do usuario, de qualquer documento, com o titulo do
// documento junto - usado na tela de codificacao qualitativa.
function listByUser(userId) {
  return db
    .prepare(
      `SELECT h.*, d.title AS document_title
       FROM highlights h
       JOIN documents d ON d.id = h.document_id
       WHERE h.user_id = ?
       ORDER BY datetime(h.created_at) DESC`
    )
    .all(userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM highlights WHERE id = ?').get(id);
}

// type: 'texto' (padrao) ou 'imagem'. Para 'imagem', imagePath e obrigatorio
// e excerpt vira so uma legenda opcional.
function create({ documentId, userId, excerpt, type, imagePath, pageNumber }) {
  const result = db
    .prepare(
      `INSERT INTO highlights (document_id, user_id, excerpt, type, image_path, page_number)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(documentId, userId, excerpt || '', type || 'texto', imagePath || null, pageNumber || null);
  return db.prepare('SELECT * FROM highlights WHERE id = ?').get(result.lastInsertRowid);
}

function remove(id, userId) {
  const destaque = db.prepare('SELECT * FROM highlights WHERE id = ? AND user_id = ?').get(id, userId);
  if (!destaque) return;

  if (destaque.image_path) {
    fs.rm(path.join(PASTA_UPLOADS, destaque.image_path), { force: true }, () => {});
  }

  db.prepare('DELETE FROM highlight_codes WHERE highlight_id = ?').run(id);
  db.prepare('DELETE FROM highlights WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = { listByDocument, countByDocument, listByUser, findById, create, remove };
