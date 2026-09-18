const db = require('./index');

// INSERT OR IGNORE: a constraint unica em (session_id, visit_date) garante
// que a mesma sessao so conta uma vez por dia, nao importa quantas paginas
// a pessoa visite.
function registrar(sessionId, data) {
  db.prepare('INSERT OR IGNORE INTO visits (session_id, visit_date) VALUES (?, ?)').run(sessionId, data);
}

function contarPorData(data) {
  const linha = db.prepare('SELECT COUNT(*) AS total FROM visits WHERE visit_date = ?').get(data);
  return linha.total;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { registrar, contarPorData, hojeISO };
