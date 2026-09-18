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

-- Trechos-chave marcados pelo usuario dentro de um documento. Pode ser um
-- trecho de texto (type='texto', excerpt preenchido) ou um recorte de
-- imagem tirado da pagina (type='imagem', image_path preenchido e excerpt
-- guarda so uma legenda opcional).
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'texto',
  excerpt TEXT NOT NULL DEFAULT '',
  image_path TEXT,
  page_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_highlights_document ON highlights(document_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user ON highlights(user_id);

-- Codigos (categorias) que o usuario cria para a codificacao qualitativa.
-- Cada codigo pertence a um unico documento - codigos criados numa pesquisa
-- nao aparecem nem se aplicam a outra.
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  document_id INTEGER REFERENCES documents(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#f0c14b',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_codes_user ON codes(user_id);

-- Liga um trecho-chave (highlight) a um ou mais codigos. Um trecho pode ter
-- varios codigos, e um codigo pode estar em varios trechos.
CREATE TABLE IF NOT EXISTS highlight_codes (
  highlight_id INTEGER NOT NULL REFERENCES highlights(id),
  code_id INTEGER NOT NULL REFERENCES codes(id),
  PRIMARY KEY (highlight_id, code_id)
);

CREATE INDEX IF NOT EXISTS idx_highlight_codes_code ON highlight_codes(code_id);

-- Registra um visitante (por sessao) por dia, so pra contar visitas unicas
-- no painel de admin - a constraint unica em (session_id, visit_date) evita
-- contar a mesma pessoa duas vezes no mesmo dia.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_session_date ON visits(session_id, visit_date);
