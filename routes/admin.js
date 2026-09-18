const express = require('express');
const bcrypt = require('bcryptjs');
const users = require('../db/users');
const visits = require('../db/visits');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const SALT_ROUNDS = 10;

function formatarDataHora(dataIso) {
  if (!dataIso) return null;
  const data = new Date(dataIso.replace(' ', 'T') + 'Z');
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

router.get('/admin', requireAdmin, (req, res) => {
  const usuarios = users.listAll().map((usuario) => ({
    ...usuario,
    cadastradoEm: formatarDataHora(usuario.created_at),
    ultimoLogin: formatarDataHora(usuario.last_login_at),
  }));

  res.render('admin-dashboard', {
    usuarios,
    visitasHoje: visits.contarPorData(visits.hojeISO()),
  });
});

router.post('/admin/usuarios/:id/senha', requireAdmin, (req, res) => {
  const novaSenha = (req.body.novaSenha || '').trim();
  if (novaSenha.length >= 6) {
    const hash = bcrypt.hashSync(novaSenha, SALT_ROUNDS);
    users.updatePasswordHash(req.params.id, hash);
  }
  res.redirect('/admin');
});

router.post('/admin/usuarios/:id/remover', requireAdmin, (req, res) => {
  // Nao deixa o admin se auto-excluir por engano enquanto esta usando a
  // propria conta pra acessar o painel.
  if (Number.parseInt(req.params.id, 10) === req.session.userId) {
    return res.redirect('/admin');
  }
  users.remove(req.params.id);
  res.redirect('/admin');
});

module.exports = router;
