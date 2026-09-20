const express = require('express');
const { requireAuth } = require('../middleware/auth');
const notifications = require('../db/notifications');

const router = express.Router();

// Link direto (sem JS): marca como lida e manda pra onde a notificacao aponta.
router.get('/notificacoes/:id/abrir', requireAuth, (req, res) => {
  const notificacao = notifications.findById(req.params.id);
  if (!notificacao || notificacao.user_id !== req.session.userId) {
    return res.redirect('/');
  }
  notifications.markRead(notificacao.id, req.session.userId);
  res.redirect(notificacao.link);
});

module.exports = router;
