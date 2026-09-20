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

-- Compartilhamento de biblioteca: o dono (owner_user_id) libera sua lista de
-- artigos salvos pra outro usuario (shared_with_user_id) ver, sem precisar
-- de aceite - a linha por si so ja autoriza a visualizacao. A constraint
-- unica impede compartilhar duas vezes com a mesma pessoa.
CREATE TABLE IF NOT EXISTS library_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_shares_par ON library_shares(owner_user_id, shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_library_shares_destinatario ON library_shares(shared_with_user_id);

-- Forum academico: topicos criados por qualquer usuario, visiveis pra
-- qualquer usuario logado (area publica da comunidade, nao precisa de
-- compartilhamento como a biblioteca).
CREATE TABLE IF NOT EXISTS forum_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_forum_topics_created ON forum_topics(created_at);

CREATE TABLE IF NOT EXISTS forum_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES forum_topics(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_forum_replies_topic ON forum_replies(topic_id);

-- Anexo pertence a um topico OU a uma resposta (nunca os dois) - por isso as
-- duas colunas sao opcionais.
CREATE TABLE IF NOT EXISTS forum_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER REFERENCES forum_topics(id),
  reply_id INTEGER REFERENCES forum_replies(id),
  file_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_forum_attachments_topic ON forum_attachments(topic_id);
CREATE INDEX IF NOT EXISTS idx_forum_attachments_reply ON forum_attachments(reply_id);

-- Notificacoes: hoje geradas por resposta em topico (avisa o dono do topico)
-- e por compartilhamento de biblioteca (avisa quem recebeu). "link" ja vem
-- pronto com pra onde a pessoa deve ir ao clicar.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  actor_user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  topic_id INTEGER REFERENCES forum_topics(id),
  link TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- Solicitacoes de amizade entre usuarios. Uma solicitacao aceita (status =
-- 'accepted') E a propria amizade - nao existe uma tabela separada de
-- "amigos", pra nao duplicar o mesmo par de usuarios em dois lugares.
CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users(id),
  addressee_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  responded_at TEXT,
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_addressee ON friend_requests(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_requester ON friend_requests(requester_id, status);

-- Mensagens privadas entre dois usuarios (so trocadas entre amigos - a
-- checagem de amizade e feita na rota, nao aqui no banco).
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, read_at);
CREATE INDEX IF NOT EXISTS idx_messages_par ON messages(sender_id, recipient_id);
