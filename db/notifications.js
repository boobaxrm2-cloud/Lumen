const db = require('./index');

function create({ userId, actorUserId, type, topicId, link }) {
  // Nao notifica a propria pessoa (ex: alguem responde o proprio topico).
  if (userId === actorUserId) return;

  db.prepare(
    `INSERT INTO notifications (user_id, actor_user_id, type, topic_id, link)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, actorUserId || null, type, topicId || null, link);
}

// Usado no sino da sidebar - mais recentes primeiro, com o nome de quem
// gerou a notificacao pra montar o texto.
function listRecentForUser(userId, limite = 10) {
  return db
    .prepare(
      `SELECT n.id, n.type, n.link, n.read_at, n.created_at, a.name AS ator_nome
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_user_id
       WHERE n.user_id = ?
       ORDER BY datetime(n.created_at) DESC
       LIMIT ?`
    )
    .all(userId, limite);
}

function countUnread(userId) {
  const linha = db
    .prepare('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId);
  return linha.total;
}

function findById(id) {
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
}

function markRead(id, userId) {
  db.prepare(
    "UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL"
  ).run(id, userId);
}

module.exports = { create, listRecentForUser, countUnread, findById, markRead };
