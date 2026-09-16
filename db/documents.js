const db = require('./index');

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

function create({ userId, articleId, title }) {
  const result = db
    .prepare('INSERT INTO documents (user_id, article_id, title) VALUES (?, ?, ?)')
    .run(userId, articleId || null, title);
  return findById(result.lastInsertRowid);
}

function remove(id, userId) {
  db.prepare('DELETE FROM highlights WHERE document_id = ? AND user_id = ?').run(id, userId);
  db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = { listByUser, findById, create, remove };
