const db = require('./index');

// So os codigos criados dentro daquele documento - codigos nao se
// estendem de uma pesquisa pra outra.
function listByDocument(documentId, userId) {
  return db
    .prepare(
      `SELECT c.* FROM codes c
       JOIN documents d ON d.id = c.document_id
       WHERE c.document_id = ? AND d.user_id = ?
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(documentId, userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM codes WHERE id = ?').get(id);
}

function create({ userId, documentId, name, color }) {
  const documento = db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?').get(documentId, userId);
  if (!documento) return null;

  const result = db
    .prepare('INSERT INTO codes (user_id, document_id, name, color) VALUES (?, ?, ?, ?)')
    .run(userId, documentId, name, color);
  return db.prepare('SELECT * FROM codes WHERE id = ?').get(result.lastInsertRowid);
}

function remove(id, userId) {
  db.prepare(
    'DELETE FROM highlight_codes WHERE code_id = (SELECT id FROM codes WHERE id = ? AND user_id = ?)'
  ).run(id, userId);
  db.prepare('DELETE FROM codes WHERE id = ? AND user_id = ?').run(id, userId);
}

// Quantos trechos estao marcados com cada codigo daquele documento.
function countUsageByDocument(documentId) {
  const linhas = db
    .prepare(
      `SELECT hc.code_id AS codeId, COUNT(*) AS total
       FROM highlight_codes hc
       JOIN codes c ON c.id = hc.code_id
       WHERE c.document_id = ?
       GROUP BY hc.code_id`
    )
    .all(documentId);
  return new Map(linhas.map((l) => [l.codeId, l.total]));
}

module.exports = { listByDocument, findById, create, remove, countUsageByDocument };
