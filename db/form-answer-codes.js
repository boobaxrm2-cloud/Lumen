const db = require('./index');

// Todos os pares resposta/codigo de um formulario de uma vez, pra montar a
// lista de respostas com seus codigos sem fazer uma consulta por resposta.
function listCodesForForm(formId) {
  return db
    .prepare(
      `SELECT ac.answer_id AS answerId, c.id, c.name, c.color
       FROM form_answer_codes ac
       JOIN form_codes c ON c.id = ac.code_id
       WHERE c.form_id = ?
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(formId);
}

function hasCode(answerId, codeId) {
  return !!db.prepare('SELECT 1 FROM form_answer_codes WHERE answer_id = ? AND code_id = ?').get(answerId, codeId);
}

// Liga/desliga um codigo numa resposta. Retorna true se ficou marcado, false
// se foi removido.
function toggle(answerId, codeId) {
  if (hasCode(answerId, codeId)) {
    db.prepare('DELETE FROM form_answer_codes WHERE answer_id = ? AND code_id = ?').run(answerId, codeId);
    return false;
  }
  db.prepare('INSERT INTO form_answer_codes (answer_id, code_id) VALUES (?, ?)').run(answerId, codeId);
  return true;
}

module.exports = { listCodesForForm, toggle };
