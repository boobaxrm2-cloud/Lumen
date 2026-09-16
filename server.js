require('dotenv').config();
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const readingRoutes = require('./routes/reading');
const { requireAuth } = require('./middleware/auth');

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
app.use(express.json());
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

// Deixa o nome do usuario logado disponivel em todas as views (ex: no cabecalho).
app.use((req, res, next) => {
  res.locals.userName = req.session.userName || null;
  next();
});

app.use('/', authRoutes);
app.use('/', articleRoutes);
app.use('/', readingRoutes);

app.get('/', requireAuth, (req, res) => {
  res.render('home', { userName: req.session.userName });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
