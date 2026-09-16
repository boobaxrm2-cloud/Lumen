require('dotenv').config();
const path = require('node:path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const { requireAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.get('/', requireAuth, (req, res) => {
  res.render('home', { userName: req.session.userName });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
