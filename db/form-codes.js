const db = require('./index');

// So os codigos daquele formulario - confirma que o formulario e do usuario
// antes de listar.
function listByForm(formId, userId) {
  return db
    .prepare(
      `SELECT c.* FROM form_codes c
       JOIN forms f ON f.id = c.form_id
       WHERE c.form_id = ? AND f.user_id = ?
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(formId, userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM form_codes WHERE id = ?').get(id);
}

function create({ userId, formId, name, color }) {
  const formulario = db.prepare('SELECT id FROM forms WHERE id = ? AND user_id = ?').get(formId, userId);
  if (!formulario) return null;

  const result = db.prepare('INSERT INTO form_codes (form_id, name, color) VALUES (?, ?, ?)').run(formId, name, color);
  return findById(result.lastInsertRowid);
}

function remove(id, userId) {
  db.prepare(
    `DELETE FROM form_answer_codes WHERE code_id = (
       SELECT c.id FROM form_codes c JOIN forms f ON f.id = c.form_id WHERE c.id = ? AND f.user_id = ?
     )`
  ).run(id, userId);
  db.prepare(
    `DELETE FROM form_codes WHERE id = ? AND form_id IN (SELECT id FROM forms WHERE user_id = ?)`
  ).run(id, userId);
}

// Quantas respostas daquela pergunta especifica estao marcadas com cada
// codigo - filtra pela pergunta atraves da resposta (form_response_answers),
// ja que o codigo em si e do formulario inteiro, nao de uma pergunta so.
function countUsageByQuestion(questionId) {
  const linhas = db
    .prepare(
      `SELECT ac.code_id AS codeId, COUNT(*) AS total
       FROM form_answer_codes ac
       JOIN form_response_answers a ON a.id = ac.answer_id
       WHERE a.question_id = ?
       GROUP BY ac.code_id`
    )
    .all(questionId);
  return new Map(linhas.map((l) => [l.codeId, l.total]));
}

// Quantas vezes cada codigo foi usado no formulario inteiro, somando todas
// as perguntas - a base do "dashboard geral" (resumo do formulario todo,
// nao fragmentado pergunta por pergunta).
function countUsageAcrossForm(formId) {
  const linhas = db
    .prepare(
      `SELECT ac.code_id AS codeId, COUNT(*) AS total
       FROM form_answer_codes ac
       JOIN form_response_answers a ON a.id = ac.answer_id
       JOIN form_questions q ON q.id = a.question_id
       WHERE q.form_id = ?
       GROUP BY ac.code_id`
    )
    .all(formId);
  return new Map(linhas.map((l) => [l.codeId, l.total]));
}

module.exports = { listByForm, findById, create, remove, countUsageByQuestion, countUsageAcrossForm };
