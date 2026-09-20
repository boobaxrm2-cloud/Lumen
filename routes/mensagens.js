const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../db/users');
const friendships = require('../db/friendships');
const messages = require('../db/messages');

const router = express.Router();

router.get('/mensagens', requireAuth, (req, res) => {
  const conversas = messages.listConversations(req.session.userId);
  res.render('mensagens', { conversas });
});

router.get('/mensagens/:id', requireAuth, (req, res) => {
  const outroId = Number(req.params.id);
  const outro = outroId ? users.findById(outroId) : null;

  // So da pra abrir a conversa com quem e amigo - checado a cada requisicao,
  // nunca so na hora de montar o link (mesmo cuidado ja tomado na biblioteca
  // compartilhada).
  if (!outro || !friendships.areFriends(req.session.userId, outro.id)) {
    return res.status(404).send(res.locals.t('messages.erroConversaNaoEncontrada'));
  }

  messages.markConversationRead(req.session.userId, outro.id);
  const historico = messages.listConversation(req.session.userId, outro.id);

  res.render('mensagens-conversa', { outro, historico });
});

router.post('/mensagens/:id', requireAuth, (req, res) => {
  const outroId = Number(req.params.id);
  const outro = outroId ? users.findById(outroId) : null;

  if (!outro || !friendships.areFriends(req.session.userId, outro.id)) {
    return res.status(404).send(res.locals.t('messages.erroConversaNaoEncontrada'));
  }

  const texto = (req.body.body || '').trim();
  if (texto) {
    messages.send(req.session.userId, outro.id, texto);
  }

  res.redirect(`/mensagens/${outro.id}`);
});

module.exports = router;
