// Conexao unica com o banco SQLite, compartilhada por todo o app.
// node:sqlite ja vem embutido no Node.js (18+), sem instalar nada nativo.
// E sincrono: nao precisa de callbacks nem de "await" para ler/escrever.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// DB_PATH permite apontar para outro arquivo (usado para testes automatizados,
// pra nunca mexer no banco real que voce usa em data/pesquisa.db).
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'pesquisa.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

// O modulo de Formularios ainda estava em desenvolvimento (sem commit) quando
// os codigos de resposta passaram de "por pergunta" pra "por formulario
// inteiro" - a tabela form_answer_codes tinha uma FK pra form_question_codes,
// que virou form_codes. Bancos locais que ja tinham essa tabela no formato
// antigo ficam com a FK apontando pra uma tabela abandonada (o que da erro de
// "FOREIGN KEY constraint failed" ao marcar um codigo numa resposta), ja que
// "CREATE TABLE IF NOT EXISTS" nao corrige uma tabela que ja existe. Apaga
// as duas tabelas antigas aqui, antes do schema rodar, pra ele recriar certo.
function tabelaExiste(nome) {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome));
}
function tabelaReferenciaTabelaAntiga(tabela, tabelaReferenciada) {
  if (!tabelaExiste(tabela)) return false;
  const fks = db.prepare(`PRAGMA foreign_key_list(${tabela})`).all();
  return fks.some((fk) => fk.table === tabelaReferenciada);
}
if (tabelaReferenciaTabelaAntiga('form_answer_codes', 'form_question_codes')) {
  db.exec('DROP TABLE form_answer_codes');
}
if (tabelaExiste('form_question_codes')) {
  db.exec('DROP TABLE form_question_codes');
}

// Aplica o schema (cria as tabelas que ainda nao existirem) toda vez que o servidor sobe.
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Pequenas migracoes: adiciona colunas novas em bancos que ja existiam antes
// delas, sem apagar os dados que ja estao la.
function adicionarColunaSeNaoExistir(tabela, coluna, definicao) {
  const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
  const jaExiste = colunas.some((c) => c.name === coluna);
  if (!jaExiste) {
    db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
  }
}

adicionarColunaSeNaoExistir('articles', 'pdf_url', 'TEXT');
adicionarColunaSeNaoExistir('documents', 'file_path', 'TEXT');
adicionarColunaSeNaoExistir('documents', 'file_size', 'INTEGER');
adicionarColunaSeNaoExistir('codes', 'document_id', 'INTEGER REFERENCES documents(id)');
adicionarColunaSeNaoExistir('highlights', 'type', "TEXT NOT NULL DEFAULT 'texto'");
adicionarColunaSeNaoExistir('highlights', 'image_path', 'TEXT');
adicionarColunaSeNaoExistir('highlights', 'page_number', 'INTEGER');
adicionarColunaSeNaoExistir('users', 'last_login_at', 'TEXT');
adicionarColunaSeNaoExistir('users', 'secret_question', 'TEXT');
adicionarColunaSeNaoExistir('users', 'secret_answer_hash', 'TEXT');
adicionarColunaSeNaoExistir('users', 'avatar_path', 'TEXT');
adicionarColunaSeNaoExistir('users', 'study_area', 'TEXT');
adicionarColunaSeNaoExistir('users', 'university', 'TEXT');
adicionarColunaSeNaoExistir('users', 'academic_background', 'TEXT');
adicionarColunaSeNaoExistir('visits', 'user_agent', 'TEXT');
adicionarColunaSeNaoExistir('form_responses', 'respondent_name', "TEXT NOT NULL DEFAULT ''");
adicionarColunaSeNaoExistir('form_responses', 'respondent_study_area', 'TEXT');

// Codigos criados antes de existir a coluna document_id ficam sem documento -
// associa cada um ao documento do primeiro trecho em que ele foi usado (ou
// remove, se nunca foi usado em nenhum trecho, ja que nao da pra saber de
// qual documento ele era).
function preencherDocumentoDosCodigosAntigos() {
  const orfaos = db.prepare('SELECT id FROM codes WHERE document_id IS NULL').all();
  orfaos.forEach((codigo) => {
    const uso = db
      .prepare(
        `SELECT h.document_id AS documentId
         FROM highlight_codes hc
         JOIN highlights h ON h.id = hc.highlight_id
         WHERE hc.code_id = ?
         LIMIT 1`
      )
      .get(codigo.id);
    if (uso) {
      db.prepare('UPDATE codes SET document_id = ? WHERE id = ?').run(uso.documentId, codigo.id);
    } else {
      db.prepare('DELETE FROM codes WHERE id = ?').run(codigo.id);
    }
  });
}
preencherDocumentoDosCodigosAntigos();

// So cria esse indice depois de garantir que a coluna existe (em bancos
// antigos ela e adicionada pela migracao acima, nao pelo schema.sql).
db.exec('CREATE INDEX IF NOT EXISTS idx_codes_document ON codes(document_id)');

module.exports = db;
