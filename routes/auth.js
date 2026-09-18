const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../db/users');
const { redirectIfLoggedIn, requireAuth } = require('../middleware/auth');
const { t } = require('../utils/i18n');

const router = express.Router();

const SALT_ROUNDS = 10;

// As 5 perguntas secretas disponiveis no cadastro (chaves - o texto traduzido
// fica em locales/*.json em "secretQuestion.<chave>"). Guardamos so a chave
// no banco pra pergunta aparecer certa depois, em qualquer idioma.
const PERGUNTAS_SECRETAS_VALIDAS = [
  'motherMaidenName',
  'firstPet',
  'birthCity',
  'firstSchool',
  'favoriteFood',
];

// Normaliza a resposta da pergunta secreta antes de comparar/gerar hash, pra
// nao diferenciar maiuscula de minuscula (nem espacos extras nas pontas).
function normalizarResposta(resposta) {
  return (resposta || '').trim().toLowerCase();
}

// So a conta com esse email (configurado em ADMIN_EMAIL) recebe acesso ao
// painel administrativo - nao existe uma senha de admin separada, e a mesma
// conta/senha de sempre.
function ehAdmin(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  return Boolean(adminEmail) && email.toLowerCase().trim() === adminEmail;
}

router.get('/cadastro', redirectIfLoggedIn, (req, res) => {
  res.render('cadastro', { erro: null, valores: { name: '', email: '' } });
});

router.post('/cadastro', redirectIfLoggedIn, (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';
  const confirmarSenha = req.body.confirmarSenha || '';
  const secretQuestion = req.body.secretQuestion || '';
  const secretAnswer = req.body.secretAnswer || '';
  const valores = { name, email };

  if (!name || !email || !password) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroCamposObrigatorios'), valores });
  }
  if (password.length < 6) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroSenhaCurta'), valores });
  }
  if (password !== confirmarSenha) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroSenhasNaoConferem'), valores });
  }
  if (!PERGUNTAS_SECRETAS_VALIDAS.includes(secretQuestion)) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroPerguntaSecretaObrigatoria'), valores });
  }
  if (!normalizarResposta(secretAnswer)) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroRespostaSecretaObrigatoria'), valores });
  }
  if (users.findByEmail(email)) {
    return res.status(400).render('cadastro', { erro: t(res.locals.lang, 'signup.erroEmailExistente'), valores });
  }

  const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
  const secretAnswerHash = bcrypt.hashSync(normalizarResposta(secretAnswer), SALT_ROUNDS);
  users.create({ name, email, passwordHash, secretQuestion, secretAnswerHash });

  res.redirect('/login?criada=1');
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
  let sucesso = null;
  if (req.query.criada) sucesso = t(res.locals.lang, 'login.contaCriadaComSucesso');
  if (req.query.senhaAlterada) sucesso = t(res.locals.lang, 'login.recovery.successMessage');
  res.render('login', { erro: null, sucesso, valores: { email: '' } });
});

router.post('/login', redirectIfLoggedIn, (req, res) => {
  const email = (req.body.email || '').trim();
  const password = req.body.password || '';

  const user = users.findByEmail(email);
  const senhaValida = user && bcrypt.compareSync(password, user.password_hash);

  if (!senhaValida) {
    return res.status(401).render('login', { erro: t(res.locals.lang, 'login.erroCredenciaisInvalidas'), sucesso: null, valores: { email } });
  }

  users.updateLastLogin(user.id);
  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.isAdmin = ehAdmin(user.email);
  res.redirect('/');
});

// Fluxo de "esqueci minha senha", em 3 etapas (ver public/js/login.js). Nao
// existe envio de email na plataforma, entao a recuperacao e feita so com a
// pergunta secreta escolhida no cadastro.
router.post('/api/recuperar-senha/pergunta', (req, res) => {
  const email = (req.body.email || '').trim();
  const user = users.findByEmail(email);

  if (!user || !user.secret_question) {
    return res.status(404).json({ erro: t(res.locals.lang, 'login.recovery.erroEmailNaoEncontrado') });
  }

  res.json({ pergunta: t(res.locals.lang, `secretQuestion.${user.secret_question}`) });
});

router.post('/api/recuperar-senha/verificar', (req, res) => {
  const email = (req.body.email || '').trim();
  const resposta = req.body.resposta || '';
  const user = users.findByEmail(email);

  const respostaValida =
    user && user.secret_answer_hash && bcrypt.compareSync(normalizarResposta(resposta), user.secret_answer_hash);

  if (!respostaValida) {
    return res.status(401).json({ erro: t(res.locals.lang, 'login.recovery.erroRespostaIncorreta') });
  }

  // Marcador temporario na sessao - autoriza so a proxima troca de senha
  // desse email, e e apagado logo depois de usado (ver rota abaixo).
  req.session.recuperacaoEmail = user.email;
  res.json({ ok: true });
});

router.post('/api/recuperar-senha/nova-senha', (req, res) => {
  const email = req.session.recuperacaoEmail;
  const novaSenha = req.body.novaSenha || '';
  const confirmarSenha = req.body.confirmarSenha || '';

  if (!email) {
    return res.status(401).json({ erro: t(res.locals.lang, 'login.recovery.erroSessaoExpirada') });
  }
  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: t(res.locals.lang, 'login.recovery.erroSenhaCurta') });
  }
  if (novaSenha !== confirmarSenha) {
    return res.status(400).json({ erro: t(res.locals.lang, 'login.recovery.erroSenhasNaoConferem') });
  }

  const user = users.findByEmail(email);
  if (!user) {
    return res.status(404).json({ erro: t(res.locals.lang, 'login.recovery.erroSessaoExpirada') });
  }

  const novoHash = bcrypt.hashSync(novaSenha, SALT_ROUNDS);
  users.updatePasswordHash(user.id, novoHash);
  delete req.session.recuperacaoEmail;
  res.json({ ok: true });
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
    return renderConta(res, 400, { user, erroNome: t(res.locals.lang, 'account.erroNomeObrigatorio') });
  }

  const atualizado = users.updateName(req.session.userId, nome);
  req.session.userName = atualizado.name;
  res.locals.userName = atualizado.name; // o topo ja foi montado com o nome antigo nesse mesmo ciclo
  renderConta(res, 200, { user: atualizado, sucessoNome: t(res.locals.lang, 'account.sucessoNome') });
});

router.post('/conta/senha', requireAuth, (req, res) => {
  const user = users.findById(req.session.userId);
  const { senhaAtual, novaSenha, confirmarSenha } = req.body;

  const senhaValida = senhaAtual && bcrypt.compareSync(senhaAtual, user.password_hash);
  if (!senhaValida) {
    return renderConta(res, 400, { user, erroSenha: t(res.locals.lang, 'account.erroSenhaAtualIncorreta') });
  }
  if (!novaSenha || novaSenha.length < 6) {
    return renderConta(res, 400, { user, erroSenha: t(res.locals.lang, 'account.erroSenhaCurta') });
  }
  if (novaSenha !== confirmarSenha) {
    return renderConta(res, 400, { user, erroSenha: t(res.locals.lang, 'account.erroConfirmacaoSenha') });
  }

  const novoHash = bcrypt.hashSync(novaSenha, SALT_ROUNDS);
  users.updatePasswordHash(req.session.userId, novoHash);
  renderConta(res, 200, { user, sucessoSenha: t(res.locals.lang, 'account.sucessoSenha') });
});

module.exports = router;
