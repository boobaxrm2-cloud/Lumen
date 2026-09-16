// Conexao unica com o banco SQLite, compartilhada por todo o app.
// node:sqlite ja vem embutido no Node.js (18+), sem instalar nada nativo.
// E sincrono: nao precisa de callbacks nem de "await" para ler/escrever.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pesquisa.db');
const db = new DatabaseSync(dbPath);

// Aplica o schema (cria as tabelas que ainda nao existirem) toda vez que o servidor sobe.
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
