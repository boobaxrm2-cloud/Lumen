-- Tabela de usuarios (pesquisadores). Cada linha e uma conta.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Artigos salvos por cada usuario (vindos da busca no Semantic Scholar).
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  abstract TEXT,
  year INTEGER,
  venue TEXT,
  authors TEXT,
  doi TEXT,
  url TEXT,
  pdf_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);

-- Um "documento" representa um PDF que o usuario carregou para leitura.
-- O arquivo fica guardado em disco (pasta uploads/), file_path aponta pra
-- ele; o texto e extraido no navegador toda vez que o PDF e aberto.
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  article_id INTEGER REFERENCES articles(id),
  title TEXT NOT NULL,
  file_path TEXT,
  file_size INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

-- Trechos-chave marcados pelo usuario dentro de um documento.
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  excerpt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);
