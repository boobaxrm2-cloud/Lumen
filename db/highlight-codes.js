const db = require('./index');

// Todos os pares trecho/codigo do usuario de uma vez, pra montar a lista de
// trechos com seus codigos sem fazer uma consulta por trecho.
function listCodesForUser(userId) {
  return db
    .prepare(
      `SELECT hc.highlight_id AS highlightId, c.id, c.name, c.color
       FROM highlight_codes hc
       JOIN codes c ON c.id = hc.code_id
       WHERE c.user_id = ?
       ORDER BY c.name COLLATE NOCASE`
    )
    .all(userId);
}

function hasCode(highlightId, codeId) {
  return !!db
    .prepare('SELECT 1 FROM highlight_codes WHERE highlight_id = ? AND code_id = ?')
    .get(highlightId, codeId);
}

// Liga/desliga um codigo num trecho. Retorna true se ficou marcado, false se
// foi removido.
function toggle(highlightId, codeId) {
  if (hasCode(highlightId, codeId)) {
    db.prepare('DELETE FROM highlight_codes WHERE highlight_id = ? AND code_id = ?').run(highlightId, codeId);
    return false;
  }
  db.prepare('INSERT INTO highlight_codes (highlight_id, code_id) VALUES (?, ?)').run(highlightId, codeId);
  return true;
}

module.exports = { listCodesForUser, toggle };
