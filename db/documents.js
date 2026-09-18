const fs = require('node:fs');
const path = require('node:path');
const db = require('./index');
const PASTA_UPLOADS = require('./uploads-dir');

function listByUser(userId) {
  return db
    .prepare(
      `SELECT documents.*, articles.title AS article_title
       FROM documents
       LEFT JOIN articles ON articles.id = documents.article_id
       WHERE documents.user_id = ?
       ORDER BY datetime(documents.created_at) DESC`
    )
    .all(userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
}

function create({ userId, articleId, title, filePath, fileSize }) {
  const result = db
    .prepare(
      `INSERT INTO documents (user_id, article_id, title, file_path, file_size)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(userId, articleId || null, title, filePath || null, fileSize || null);
  return findById(result.lastInsertRowid);
}

function remove(id, userId) {
  const documento = db
    .prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?')
    .get(id, userId);
  if (!documento) return;

  if (documento.file_path) {
    const caminhoAbsoluto = path.join(PASTA_UPLOADS, documento.file_path);
    fs.rm(caminhoAbsoluto, { force: true }, () => {}); // limpeza best-effort, nao trava se falhar
  }

  // Recortes de imagem dos trechos-chave desse documento tambem sao arquivos
  // em disco - precisam ser apagados junto, senao ficam orfaos na pasta uploads/.
  const recortes = db
    .prepare('SELECT image_path FROM highlights WHERE document_id = ? AND image_path IS NOT NULL')
    .all(id);
  recortes.forEach((r) => fs.rm(path.join(PASTA_UPLOADS, r.image_path), { force: true }, () => {}));

  db.prepare(
    'DELETE FROM highlight_codes WHERE highlight_id IN (SELECT id FROM highlights WHERE document_id = ?)'
  ).run(id);
  db.prepare('DELETE FROM highlights WHERE document_id = ? AND user_id = ?').run(id, userId);
  db.prepare('DELETE FROM codes WHERE document_id = ?').run(id);
  db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = { listByUser, findById, create, remove };
