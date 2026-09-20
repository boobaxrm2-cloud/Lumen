const db = require('./index');

// Uma solicitacao aceita E a amizade - nao existe tabela separada de "amigos".

function findBetween(userA, userB) {
  return db
    .prepare(
      `SELECT * FROM friend_requests
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(userA, userB, userB, userA);
}

function findById(id) {
  return db.prepare('SELECT * FROM friend_requests WHERE id = ?').get(id);
}

// Se ja existia uma solicitacao recusada nesse mesmo sentido (mesmo
// requester/addressee), reaproveita a linha em vez de tentar inserir outra -
// a coluna UNIQUE(requester_id, addressee_id) nao deixaria criar duas.
function create(requesterId, addresseeId) {
  db.prepare(
    `INSERT INTO friend_requests (requester_id, addressee_id, status)
     VALUES (?, ?, 'pending')
     ON CONFLICT(requester_id, addressee_id)
     DO UPDATE SET status = 'pending', created_at = datetime('now'), responded_at = NULL`
  ).run(requesterId, addresseeId);
  return findBetween(requesterId, addresseeId);
}

function accept(id) {
  db.prepare(`UPDATE friend_requests SET status = 'accepted', responded_at = datetime('now') WHERE id = ?`).run(id);
}

function reject(id) {
  db.prepare(`UPDATE friend_requests SET status = 'rejected', responded_at = datetime('now') WHERE id = ?`).run(id);
}

// Status da relacao entre "userId" (quem esta olhando) e "otherId" (o perfil
// visto), usado pra decidir qual botao mostrar no popup de perfil.
function statusBetween(userId, otherId) {
  if (userId === otherId) return { status: 'self', request: null };

  const pedido = findBetween(userId, otherId);
  if (!pedido || pedido.status === 'rejected') return { status: 'none', request: null };
  if (pedido.status === 'accepted') return { status: 'friends', request: pedido };
  // status === 'pending'
  if (pedido.requester_id === userId) return { status: 'pending_sent', request: pedido };
  return { status: 'pending_received', request: pedido };
}

function areFriends(userA, userB) {
  const pedido = findBetween(userA, userB);
  return !!pedido && pedido.status === 'accepted';
}

function listPendingReceived(userId) {
  return db
    .prepare(
      `SELECT fr.id, fr.created_at, u.id AS autor_id, u.name AS autor_nome,
       u.avatar_path AS autor_avatar, u.study_area AS autor_area
       FROM friend_requests fr
       JOIN users u ON u.id = fr.requester_id
       WHERE fr.addressee_id = ? AND fr.status = 'pending'
       ORDER BY datetime(fr.created_at) DESC`
    )
    .all(userId);
}

function countPendingReceived(userId) {
  const linha = db
    .prepare(`SELECT COUNT(*) AS total FROM friend_requests WHERE addressee_id = ? AND status = 'pending'`)
    .get(userId);
  return linha.total;
}

function listFriends(userId) {
  return db
    .prepare(
      `SELECT u.id, u.name, u.avatar_path, u.study_area, u.university, u.academic_background
       FROM friend_requests fr
       JOIN users u ON u.id = CASE WHEN fr.requester_id = ? THEN fr.addressee_id ELSE fr.requester_id END
       WHERE (fr.requester_id = ? OR fr.addressee_id = ?) AND fr.status = 'accepted'
       ORDER BY u.name COLLATE NOCASE ASC`
    )
    .all(userId, userId, userId);
}

module.exports = {
  findBetween,
  findById,
  create,
  accept,
  reject,
  statusBetween,
  areFriends,
  listPendingReceived,
  countPendingReceived,
  listFriends,
};
