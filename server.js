require('dotenv').config();
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const readingRoutes = require('./routes/reading');
const codingRoutes = require('./routes/codificacao');
const idiomaRoutes = require('./routes/idioma');
const adminRoutes = require('./routes/admin');
const forumRoutes = require('./routes/forum');
const notificationRoutes = require('./routes/notifications');
const networkRoutes = require('./routes/network');
const mensagensRoutes = require('./routes/mensagens');
const formulariosRoutes = require('./routes/formularios');
const { requireAuth } = require('./middleware/auth');
const { t, idiomaValido, LOCALE_POR_IDIOMA } = require('./utils/i18n');
const visits = require('./db/visits');
const notifications = require('./db/notifications');
const friendships = require('./db/friendships');
const messages = require('./db/messages');

if (!process.env.SESSION_SECRET) {
  console.error('Faltou configurar a variavel de ambiente SESSION_SECRET (veja o .env.example).');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;
const EM_PRODUCAO = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Em producao, o servidor fica atras do proxy da hospedagem (HTTPS termina la,
// e chega ate nos como HTTP comum). Isso avisa o Express pra confiar no
// cabecalho X-Forwarded-Proto, senao ele acha que a conexao nao e segura.
if (EM_PRODUCAO) {
  app.set('trust proxy', 1);
}

app.use(express.urlencoded({ extended: false }));
// Limite maior que o padrao (100kb) porque os recortes de imagem da
// codificacao chegam como base64 dentro do JSON.
app.use(express.json({ limit: '8mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'pesquisa.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: EM_PRODUCAO, // cookie so trafega por HTTPS quando em producao
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 dias
    },
  })
);

// Deixa o nome do usuario logado e o idioma atual disponiveis em todas as views.
app.use((req, res, next) => {
  res.locals.userName = req.session.userName || null;
  res.locals.isAdmin = Boolean(req.session.isAdmin);

  const lang = idiomaValido(req.cookies.idioma);
  res.locals.lang = lang;
  res.locals.locale = LOCALE_POR_IDIOMA[lang];
  res.locals.t = (chave, params) => t(lang, chave, params);
  res.locals.paginaAtualUrl = req.originalUrl;

  if (req.session.userId) {
    res.locals.notificacoesRecentes = notifications.listRecentForUser(req.session.userId, 10);
    res.locals.notificacoesNaoLidas = notifications.countUnread(req.session.userId);
    res.locals.mensagensNaoLidas = messages.countUnread(req.session.userId);
    res.locals.solicitacoesAmizadePendentes = friendships.countPendingReceived(req.session.userId);
  } else {
    res.locals.notificacoesRecentes = [];
    res.locals.notificacoesNaoLidas = 0;
    res.locals.mensagensNaoLidas = 0;
    res.locals.solicitacoesAmizadePendentes = 0;
  }

  next();
});

// Conta visitantes unicos por dia (usado no painel de admin). So em GETs de
// pagina de verdade - nao em chamadas de API nem no proprio painel de admin.
// Guardar a data na sessao evita bater no banco de novo pra cada pagina que
// a mesma pessoa visita no mesmo dia, e tambem garante que o navegador dela
// passe a ter um cookie de sessao estavel (sem isso, saveUninitialized:false
// geraria um sessionID novo a cada request de quem nunca fez login).
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/admin')) {
    const hoje = visits.hojeISO();
    if (req.session.ultimaVisitaRegistrada !== hoje) {
      req.session.ultimaVisitaRegistrada = hoje;
      visits.registrar(req.sessionID, hoje, req.get('User-Agent'));
    }
  }
  next();
});

app.use('/', idiomaRoutes);
app.use('/', authRoutes);
app.use('/', articleRoutes);
app.use('/', readingRoutes);
app.use('/', codingRoutes);
app.use('/', adminRoutes);
app.use('/', forumRoutes);
app.use('/', notificationRoutes);
app.use('/', networkRoutes);
app.use('/', mensagensRoutes);
app.use('/', formulariosRoutes);

app.get('/', requireAuth, (req, res) => {
  res.render('home', { userName: req.session.userName });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
