const fs = require('node:fs');
const path = require('node:path');
const db = require('./index');
const PASTA_UPLOADS = require('./uploads-dir');

// ---------- Topicos ----------

function listTopics({ q } = {}) {
  const termo = (q || '').trim();
  const filtroBusca = termo ? 'WHERE t.title LIKE ? OR t.message LIKE ?' : '';
  const linhas = db
    .prepare(
      `SELECT
         t.id, t.title, t.message, t.created_at, t.updated_at,
         t.user_id,
         u.name AS autor_nome, u.avatar_path AS autor_avatar, u.study_area AS autor_area,
         (SELECT COUNT(*) FROM forum_replies r WHERE r.topic_id = t.id) AS total_respostas,
         (SELECT COUNT(*) FROM forum_attachments a WHERE a.topic_id = t.id) AS total_anexos
       FROM forum_topics t
       JOIN users u ON u.id = t.user_id
       ${filtroBusca}
       ORDER BY datetime(t.created_at) DESC`
    )
    .all(...(termo ? [`%${termo}%`, `%${termo}%`] : []));
  return linhas;
}

function findTopicById(id) {
  return db
    .prepare(
      `SELECT
         t.id, t.title, t.message, t.created_at, t.updated_at,
         t.user_id,
         u.name AS autor_nome, u.avatar_path AS autor_avatar, u.study_area AS autor_area
       FROM forum_topics t
       JOIN users u ON u.id = t.user_id
       WHERE t.id = ?`
    )
    .get(id);
}

function createTopic({ userId, title, message }) {
  const result = db
    .prepare('INSERT INTO forum_topics (user_id, title, message) VALUES (?, ?, ?)')
    .run(userId, title, message);
  return findTopicById(result.lastInsertRowid);
}

function updateTopic(id, { title, message }) {
  db.prepare(
    "UPDATE forum_topics SET title = ?, message = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, message, id);
  return findTopicById(id);
}

function removeAttachmentFiles(anexos) {
  anexos.forEach((anexo) => {
    fs.rm(path.join(PASTA_UPLOADS, anexo.file_path), { force: true }, () => {});
  });
}

function removeTopic(id) {
  const anexosTopico = db.prepare('SELECT file_path FROM forum_attachments WHERE topic_id = ?').all(id);
  const anexosRespostas = db
    .prepare(
      `SELECT fa.file_path FROM forum_attachments fa
       JOIN forum_replies r ON r.id = fa.reply_id
       WHERE r.topic_id = ?`
    )
    .all(id);
  removeAttachmentFiles(anexosTopico);
  removeAttachmentFiles(anexosRespostas);

  db.prepare(
    'DELETE FROM forum_attachments WHERE topic_id = ? OR reply_id IN (SELECT id FROM forum_replies WHERE topic_id = ?)'
  ).run(id, id);
  db.prepare('DELETE FROM notifications WHERE topic_id = ?').run(id);
  db.prepare('DELETE FROM forum_replies WHERE topic_id = ?').run(id);
  db.prepare('DELETE FROM forum_topics WHERE id = ?').run(id);
}

// ---------- Respostas ----------

function listRepliesByTopic(topicId) {
  return db
    .prepare(
      `SELECT
         r.id, r.topic_id, r.message, r.created_at, r.updated_at,
         r.user_id,
         u.name AS autor_nome, u.avatar_path AS autor_avatar, u.study_area AS autor_area
       FROM forum_replies r
       JOIN users u ON u.id = r.user_id
       WHERE r.topic_id = ?
       ORDER BY datetime(r.created_at) ASC`
    )
    .all(topicId);
}

function findReplyById(id) {
  return db.prepare('SELECT * FROM forum_replies WHERE id = ?').get(id);
}

function createReply({ topicId, userId, message }) {
  const result = db
    .prepare('INSERT INTO forum_replies (topic_id, user_id, message) VALUES (?, ?, ?)')
    .run(topicId, userId, message);
  return findReplyById(result.lastInsertRowid);
}

function updateReply(id, message) {
  db.prepare("UPDATE forum_replies SET message = ?, updated_at = datetime('now') WHERE id = ?").run(message, id);
  return findReplyById(id);
}

function removeReply(id) {
  const anexos = db.prepare('SELECT file_path FROM forum_attachments WHERE reply_id = ?').all(id);
  removeAttachmentFiles(anexos);
  db.prepare('DELETE FROM forum_attachments WHERE reply_id = ?').run(id);
  db.prepare('DELETE FROM forum_replies WHERE id = ?').run(id);
}

// ---------- Anexos ----------

function listAttachmentsByTopic(topicId) {
  return db.prepare('SELECT * FROM forum_attachments WHERE topic_id = ?').all(topicId);
}

function listAttachmentsByReply(replyId) {
  return db.prepare('SELECT * FROM forum_attachments WHERE reply_id = ?').all(replyId);
}

function findAttachmentById(id) {
  return db.prepare('SELECT * FROM forum_attachments WHERE id = ?').get(id);
}

function createAttachment({ topicId, replyId, filePath, originalName, kind }) {
  db.prepare(
    `INSERT INTO forum_attachments (topic_id, reply_id, file_path, original_name, kind)
     VALUES (?, ?, ?, ?, ?)`
  ).run(topicId || null, replyId || null, filePath, originalName, kind);
}

module.exports = {
  listTopics,
  findTopicById,
  createTopic,
  updateTopic,
  removeTopic,
  listRepliesByTopic,
  findReplyById,
  createReply,
  updateReply,
  removeReply,
  listAttachmentsByTopic,
  listAttachmentsByReply,
  findAttachmentById,
  createAttachment,
};
