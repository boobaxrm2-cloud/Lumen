const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../db/users');
const { redirectIfLoggedIn } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 10;

router.get('/cadastro', redirectIfLoggedIn, (req, res) => {
  res.render('cadastro', { erro: null, valores: { name: '', email: '' } });
});

router.post('/cadastro', redirectIfLoggedIn, (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const valores = { name, email };

  if (!name || !email || !password) {
    return res.status(400).render('cadastro', { erro: 'Preencha nome, email e senha.', valores });
  }
  if (password.length < 6) {
    return res.status(400).render('cadastro', { erro: 'A senha precisa ter pelo menos 6 caracteres.', valores });
  }
  if (users.findByEmail(email)) {
    return res.status(400).render('cadastro', { erro: 'Ja existe uma conta com esse email.', valores });
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const user = users.create({ name, email, passwordHash });

  req.session.userId = user.id;
  req.session.userName = user.name;
  res.redirect('/');
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('login', { erro: null, valores: { email: '' } });
});

router.post('/login', redirectIfLoggedIn, (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  const user = users.findByEmail(email);
  const senhaValida = user && bcrypt.compareSync(password, user.password_hash);

  if (!senhaValida) {
    return res.status(401).render('login', { erro: 'Email ou senha invalidos.', valores: { email } });
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
