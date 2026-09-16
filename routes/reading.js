const express = require('express');
const { requireAuth } = require('../middleware/auth');
const documents = require('../db/documents');
const highlights = require('../db/highlights');
const articles = require('../db/articles');

const router = express.Router();

router.get('/leitura', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const meusArtigos = articles.listByUser(userId);
  const meusDocumentos = documents.listByUser(userId).map((doc) => ({
    ...doc,
    destaques: highlights.listByDocument(doc.id, userId),
  }));

  res.render('leitura', { meusArtigos, meusDocumentos });
});

router.post('/api/documentos', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const titulo = (req.body.title || '').trim();
  const articleId = req.body.articleId ? Number.parseInt(req.body.articleId, 10) : null;

  if (!titulo) {
    return res.status(400).json({ erro: 'Informe um título para o documento.' });
  }

  if (articleId) {
    const artigo = articles.findById(articleId);
    if (!artigo || artigo.user_id !== userId) {
      return res.status(400).json({ erro: 'Artigo inválido.' });
    }
  }

  const documento = documents.create({ userId, articleId, title: titulo });
  res.status(201).json({ documento });
});

router.post('/api/documentos/:id/destaques', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const documentId = Number.parseInt(req.params.id, 10);
  const texto = (req.body.excerpt || '').trim();

  if (!texto) {
    return res.status(400).json({ erro: 'Selecione um trecho de texto antes de marcar.' });
  }

  const documento = documents.findById(documentId);
  if (!documento || documento.user_id !== userId) {
    return res.status(404).json({ erro: 'Documento não encontrado.' });
  }

  const destaque = highlights.create({ documentId, userId, excerpt: texto });
  res.status(201).json({ destaque });
});

router.post('/documentos/:id/remover', requireAuth, (req, res) => {
  documents.remove(req.params.id, req.session.userId);
  res.redirect('/leitura');
});

router.post('/destaques/:id/remover', requireAuth, (req, res) => {
  highlights.remove(req.params.id, req.session.userId);
  res.redirect('/leitura');
});

module.exports = router;
