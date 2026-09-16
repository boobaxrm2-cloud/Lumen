const db = require('./index');

function listByUser(userId) {
  return db
    .prepare('SELECT * FROM articles WHERE user_id = ? ORDER BY datetime(created_at) DESC')
    .all(userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id);
}

function create({ userId, title, abstract, year, venue, authors, doi, url, pdfUrl }) {
  const result = db
    .prepare(
      `INSERT INTO articles (user_id, title, abstract, year, venue, authors, doi, url, pdf_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      title,
      abstract || '',
      year || null,
      venue || '',
      authors || '',
      doi || null,
      url || null,
      pdfUrl || null
    );
  return findById(result.lastInsertRowid);
}

function remove(id, userId) {
  db.prepare('DELETE FROM articles WHERE id = ? AND user_id = ?').run(id, userId);
}

module.exports = { listByUser, findById, create, remove };
