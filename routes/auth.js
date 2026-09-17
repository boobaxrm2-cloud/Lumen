const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../db/users');
const { redirectIfLoggedIn, requireAuth } = require('../middleware/auth');

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

function renderConta(res, status, { user, erroNome, sucessoNome, erroSenha, sucessoSenha }) {
  res.status(status).render('conta', {
    user,
    erroNome: erroNome || null,
    sucessoNome: sucessoNome || null,
    erroSenha: erroSenha || null,
    sucessoSenha: sucessoSenha || null,
  });
}

router.get('/conta', requireAuth, (req, res) => {
  renderConta(res, 200, { user: users.findById(req.session.userId) });
});

router.post('/conta/nome', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  const nome = (req.body.name || '').trim();

  if (!nome) {
    return renderConta(res, 400, { user, erroNome: 'Informe um nome.' });
  }

  const atualizado = users.updateName(req.session.userId, nome);
  req.session.userName = atualizado.name;
  res.locals.userName = atualizado.name; // o topo ja foi montado com o nome antigo nesse mesmo ciclo
  renderConta(res, 200, { user: atualizado, sucessoNome: 'Nome atualizado com sucesso.' });
});

router.post('/conta/senha', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  const { senhaAtual, novaSenha, confirmarSenha } = req.body;

  const senhaValida = senhaAtual && bcrypt.compareSync(senhaAtual, user.password_hash);
  if (!senhaValida) {
    return renderConta(res, 400, { user, erroSenha: 'Senha atual incorreta.' });
  }
  if (!novaSenha || novaSenha.length < 6) {
    return renderConta(res, 400, { user, erroSenha: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  }
  if (novaSenha !== confirmarSenha) {
    return renderConta(res, 400, { user, erroSenha: 'A confirmação não confere com a nova senha.' });
  }

  const novoHash = bcrypt.hashSync(novaSenha, SALT_ROUNDS);
  users.updatePasswordHash(req.session.userId, novoHash);
  renderConta(res, 200, { user, sucessoSenha: 'Senha alterada com sucesso.' });
});

module.exports = router;
