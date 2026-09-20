const express = require('express');
const { requireAuth } = require('../middleware/auth');
const users = require('../db/users');
const friendships = require('../db/friendships');
const notifications = require('../db/notifications');

const router = express.Router();

router.get('/network', requireAuth, (req, res) => {
  const amigos = friendships.listFriends(req.session.userId);
  const pendentes = friendships.listPendingReceived(req.session.userId);
  res.render('network', { amigos, pendentes });
});

// Dados do popup de perfil (clicado a partir do avatar/nome no forum, ou de
// qualquer outro lugar que use o mesmo componente no futuro).
router.get('/usuarios/:id/perfil', requireAuth, (req, res) => {
  const usuario = users.findById(req.params.id);
  if (!usuario) {
    return res.status(404).json({ erro: res.locals.t('network.erroUsuarioNaoEncontrado') });
  }

  const { status, request } = friendships.statusBetween(req.session.userId, usuario.id);

  res.json({
    id: usuario.id,
    nome: usuario.name,
    temFoto: Boolean(usuario.avatar_path),
    area: usuario.study_area || null,
    universidade: usuario.university || null,
    formacaoAcademica: usuario.academic_background || null,
    status,
    requestId: request ? request.id : null,
  });
});

// Chamado via fetch() a partir do popup de perfil - so faz sentido com JS,
// por isso responde sempre em JSON (nao existe versao "sem JS" desse botao).
router.post('/network/solicitar', requireAuth, (req, res) => {
  const alvoId = Number(req.body.userId);
  const alvo = alvoId ? users.findById(alvoId) : null;

  if (!alvo) {
    return res.status(404).json({ erro: res.locals.t('network.erroUsuarioNaoEncontrado') });
  }
  if (alvo.id === req.session.userId) {
    return res.status(400).json({ erro: res.locals.t('network.erroSolicitarSiMesmo') });
  }

  const existente = friendships.findBetween(req.session.userId, alvo.id);
  if (existente && existente.status !== 'rejected') {
    return res.status(400).json({ erro: res.locals.t('network.erroSolicitacaoJaExiste') });
  }

  const pedido = friendships.create(req.session.userId, alvo.id);

  notifications.create({
    userId: alvo.id,
    actorUserId: req.session.userId,
    type: 'friend_request',
    link: '/network',
  });

  res.status(201).json({ ok: true, status: 'pending_sent', requestId: pedido.id });
});

// Aceitar/recusar funcionam tanto num form comum (pagina Network, sem JS)
// quanto via fetch() (popup de perfil) - o tipo de resposta muda conforme
// como a requisicao chegou.
router.post('/solicitacoes/:id/aceitar', requireAuth, (req, res) => {
  const pedido = friendships.findById(req.params.id);
  const semPermissao = !pedido || pedido.addressee_id !== req.session.userId || pedido.status !== 'pending';

  if (semPermissao) {
    if (req.is('application/json')) return res.status(404).json({ erro: res.locals.t('network.erroSolicitacaoNaoEncontrada') });
    return res.status(404).send(res.locals.t('network.erroSolicitacaoNaoEncontrada'));
  }

  friendships.accept(pedido.id);
  notifications.create({
    userId: pedido.requester_id,
    actorUserId: req.session.userId,
    type: 'friend_accepted',
    link: '/network',
  });

  if (req.is('application/json')) return res.json({ ok: true, status: 'friends' });
  res.redirect('/network');
});

router.post('/solicitacoes/:id/recusar', requireAuth, (req, res) => {
  const pedido = friendships.findById(req.params.id);
  const semPermissao = !pedido || pedido.addressee_id !== req.session.userId || pedido.status !== 'pending';

  if (semPermissao) {
    if (req.is('application/json')) return res.status(404).json({ erro: res.locals.t('network.erroSolicitacaoNaoEncontrada') });
    return res.status(404).send(res.locals.t('network.erroSolicitacaoNaoEncontrada'));
  }

  friendships.reject(pedido.id);

  if (req.is('application/json')) return res.json({ ok: true, status: 'none' });
  res.redirect('/network');
});

module.exports = router;
