const db = require('./index');

// INSERT OR IGNORE: a constraint unica em (session_id, visit_date) garante
// que a mesma sessao so conta uma vez por dia, nao importa quantas paginas
// a pessoa visite.
function registrar(sessionId, data, userAgent) {
  db.prepare('INSERT OR IGNORE INTO visits (session_id, visit_date, user_agent) VALUES (?, ?, ?)').run(
    sessionId,
    data,
    userAgent || null
  );
}

function contarPorData(data) {
  const linha = db.prepare('SELECT COUNT(*) AS total FROM visits WHERE visit_date = ?').get(data);
  return linha.total;
}

// Usado no painel de admin pra dar uma pista (nao 100% confiavel - user
// agent pode ser forjado) de quais acessos parecem bots/crawlers em vez de
// gente de verdade.
function listarPorData(data) {
  return db
    .prepare('SELECT user_agent, created_at FROM visits WHERE visit_date = ? ORDER BY datetime(created_at) DESC')
    .all(data);
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { registrar, contarPorData, listarPorData, hojeISO };
