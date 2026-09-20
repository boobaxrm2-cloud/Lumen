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
