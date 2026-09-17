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

module.exports = db;
