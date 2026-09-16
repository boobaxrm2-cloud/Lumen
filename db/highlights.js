const db = require('./index');

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

function create({ documentId, userId, excerpt }) {
  const result = db
    .prepare('INSERT INTO highlights (document_id, user_id, excerpt) VALUES (?, ?, ?)')
    .run(documentId, userId, excerpt);
  return db.prepare('SELECT * FROM highlights WHERE id = ?').get(result.lastInsertRowid);
}

function remove(id, userId) {
  db.prepare('DELETE FROM highlights WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = { listByDocument, countByDocument, create, remove };
