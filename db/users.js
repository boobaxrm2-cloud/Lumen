const fs = require('node:fs');
const path = require('node:path');
const db = require('./index');
const documents = require('./documents');
const PASTA_UPLOADS = require('./uploads-dir');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Usado no painel de admin - lista todo mundo cadastrado, sem o hash de senha.
function listAll() {
  return db
    .prepare(
      'SELECT id, name, email, created_at, last_login_at FROM users ORDER BY name COLLATE NOCASE'
    )
    .all();
}

function create({ name, email, passwordHash, secretQuestion, secretAnswerHash }) {
  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, secret_question, secret_answer_hash)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(name.trim(), email.toLowerCase().trim(), passwordHash, secretQuestion, secretAnswerHash);
  return findById(result.lastInsertRowid);
}

function updateName(id, name) {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.trim(), id);
  return findById(id);
}

function updatePasswordHash(id, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function updateLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
}

// Protecao contra tentativa de adivinhar senha: depois de LIMITE_TENTATIVAS_LOGIN
// erros seguidos, a conta fica bloqueada por DURACAO_BLOQUEIO_MINUTOS. Qualquer
// login certo zera o contador (resetarTentativasLogin).
const LIMITE_TENTATIVAS_LOGIN = 5;
const DURACAO_BLOQUEIO_MINUTOS = 15;

// Um UPDATE so (sem ler o valor antes) pra nao ter corrida entre ler e
// escrever se duas tentativas chegarem quase juntas - o CASE decide se
// esse erro e o que estoura o limite e, se for, ja grava o bloqueio.
function registrarTentativaLoginFalha(id) {
  db.prepare(
    `UPDATE users
     SET failed_login_attempts = failed_login_attempts + 1,
         locked_until = CASE
           WHEN failed_login_attempts + 1 >= ? THEN datetime('now', '+' || ? || ' minutes')
           ELSE locked_until
         END
     WHERE id = ?`
  ).run(LIMITE_TENTATIVAS_LOGIN, DURACAO_BLOQUEIO_MINUTOS, id);
}

function resetarTentativasLogin(id) {
  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
}

// Compara direto no SQLite (em vez de fazer o parse do texto em JS) pra nao
// correr risco de bagunçar fuso horario - datetime('now') do SQLite e sempre
// em UTC, e datetime(locked_until) trata o valor salvo do mesmo jeito.
function loginBloqueado(id) {
  const linha = db
    .prepare(
      `SELECT 1 AS bloqueado FROM users
       WHERE id = ? AND locked_until IS NOT NULL AND datetime(locked_until) > datetime('now')`
    )
    .get(id);
  return Boolean(linha);
}

// Quantos minutos faltam pro bloqueio acabar (arredondado pra cima, pra
// nunca mostrar "0 minutos" enquanto ainda esta bloqueado).
function minutosRestantesBloqueio(id) {
  const linha = db
    .prepare(
      `SELECT CAST((julianday(locked_until) - julianday('now')) * 24 * 60 AS INTEGER) + 1 AS minutos
       FROM users
       WHERE id = ? AND locked_until IS NOT NULL`
    )
    .get(id);
  return linha && linha.minutos > 0 ? linha.minutos : 1;
}

function updateProfile(id, { studyArea, university, academicBackground }) {
  db.prepare(
    'UPDATE users SET study_area = ?, university = ?, academic_background = ? WHERE id = ?'
  ).run(studyArea || null, university || null, academicBackground || null, id);
  return findById(id);
}

// Antes de gravar o caminho novo, apaga o arquivo da foto antiga (se tinha
// uma) - limpeza best-effort, mesmo padrao ja usado em documents.remove.
function updateAvatarPath(id, novoPath) {
  const usuario = findById(id);
  if (usuario && usuario.avatar_path) {
    fs.rm(path.join(PASTA_UPLOADS, usuario.avatar_path), { force: true }, () => {});
  }
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(novoPath, id);
  return findById(id);
}

// Apaga o usuario e tudo que pertence a ele. Reaproveita documents.remove
// (que ja cuida de apagar trechos, codigos e arquivos em disco de cada
// documento) em vez de duplicar essa limpeza aqui.
function remove(id) {
  const usuario = findById(id);
  if (usuario && usuario.avatar_path) {
    fs.rm(path.join(PASTA_UPLOADS, usuario.avatar_path), { force: true }, () => {});
  }
  const documentosDoUsuario = db.prepare('SELECT id FROM documents WHERE user_id = ?').all(id);
  documentosDoUsuario.forEach((doc) => documents.remove(doc.id, id));
  db.prepare('DELETE FROM articles WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

module.exports = {
  findByEmail,
  findById,
  listAll,
  create,
  updateName,
  updatePasswordHash,
  updateLastLogin,
  updateProfile,
  updateAvatarPath,
  remove,
  registrarTentativaLoginFalha,
  resetarTentativasLogin,
  loginBloqueado,
  minutosRestantesBloqueio,
};
