const db = require('./index');

function exists(ownerId, sharedWithId) {
  const linha = db
    .prepare('SELECT 1 FROM library_shares WHERE owner_user_id = ? AND shared_with_user_id = ?')
    .get(ownerId, sharedWithId);
  return Boolean(linha);
}

function create(ownerId, sharedWithId) {
  db.prepare('INSERT INTO library_shares (owner_user_id, shared_with_user_id) VALUES (?, ?)').run(
    ownerId,
    sharedWithId
  );
}

// Pra cada pessoa que compartilhou a biblioteca dela com userId, traz o id/nome/email
// dela (usado na aba "Biblioteca Compartilhada").
function listSharedWithMe(userId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.email
       FROM library_shares ls
       JOIN users u ON u.id = ls.owner_user_id
       WHERE ls.shared_with_user_id = ?
       ORDER BY u.name COLLATE NOCASE`
    )
    .all(userId);
}

module.exports = { exists, create, listSharedWithMe };
