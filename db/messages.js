const db = require('./index');

function send(senderId, recipientId, body) {
  db.prepare('INSERT INTO messages (sender_id, recipient_id, body) VALUES (?, ?, ?)').run(
    senderId,
    recipientId,
    body
  );
}

// Historico da conversa entre dois usuarios, em ordem cronologica.
function listConversation(userA, userB) {
  return db
    .prepare(
      `SELECT * FROM messages
       WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
       ORDER BY datetime(created_at) ASC`
    )
    .all(userA, userB, userB, userA);
}

// Marca como lidas as mensagens que "outroId" mandou pra "userId".
function markConversationRead(userId, outroId) {
  db.prepare(
    `UPDATE messages SET read_at = datetime('now')
     WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`
  ).run(userId, outroId);
}

// Lista de conversas do usuario: uma linha por pessoa com quem ja trocou
// mensagem, com a ultima mensagem e a contagem de nao lidas daquela pessoa.
function listConversations(userId) {
  return db
    .prepare(
      `SELECT
         outro.id AS outro_id, outro.name AS outro_nome, outro.avatar_path AS outro_avatar,
         ultima.body AS ultima_mensagem, ultima.created_at AS ultima_data,
         (SELECT COUNT(*) FROM messages m2
          WHERE m2.sender_id = outro.id AND m2.recipient_id = ? AND m2.read_at IS NULL) AS nao_lidas
       FROM (
         SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END AS outro_id,
                MAX(id) AS ultima_id
         FROM messages
         WHERE sender_id = ? OR recipient_id = ?
         GROUP BY outro_id
       ) conversas
       JOIN users outro ON outro.id = conversas.outro_id
       JOIN messages ultima ON ultima.id = conversas.ultima_id
       ORDER BY datetime(ultima.created_at) DESC`
    )
    .all(userId, userId, userId, userId);
}

function countUnread(userId) {
  const linha = db
    .prepare('SELECT COUNT(*) AS total FROM messages WHERE recipient_id = ? AND read_at IS NULL')
    .get(userId);
  return linha.total;
}

module.exports = { send, listConversation, markConversationRead, listConversations, countUnread };
