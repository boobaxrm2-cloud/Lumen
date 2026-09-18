const express = require('express');
const { idiomaValido } = require('../utils/i18n');

const router = express.Router();

router.post('/idioma', (req, res) => {
  const idioma = idiomaValido(req.body.idioma);
  res.cookie('idioma', idioma, {
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 ano
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  const destino = req.body.voltarPara || req.get('Referer') || '/';
  res.redirect(destino);
});

module.exports = router;
