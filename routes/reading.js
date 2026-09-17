const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const documents = require('../db/documents');
const highlights = require('../db/highlights');
const articles = require('../db/articles');

const router = express.Router();

const PASTA_UPLOADS = require('../db/uploads-dir');
const LIMITE_TAMANHO_ARQUIVO = 30 * 1024 * 1024; // 30 MB

// Guarda o PDF de verdade em disco (pasta uploads/<id-do-usuario>/), pra
// permitir reabrir e baixar depois sem precisar reenviar o arquivo.
const armazenamento = multer.diskStorage({
  destination: (req, file, callback) => {
    const pastaUsuario = path.join(PASTA_UPLOADS, String(req.session.userId));
    fs.mkdirSync(pastaUsuario, { recursive: true });
    callback(null, pastaUsuario);
  },
  filename: (req, file, callback) => {
    const nomeAleatorio = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    callback(null, nomeAleatorio);
  },
});

const upload = multer({
  storage: armazenamento,
  limits: { fileSize: LIMITE_TAMANHO_ARQUIVO },
  fileFilter: (req, file, callback) => {
    if (file.mimetype !== 'application/pdf') {
      return callback(new Error('Envie apenas arquivos PDF.'));
    }
    callback(null, true);
  },
});

function nomeArquivoSeguro(titulo) {
  return (titulo || 'documento').replace(/[^\w.-]+/g, '_').slice(0, 100);
}

function formatarTamanho(bytes) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatarData(dataIso) {
  const data = new Date(dataIso.replace(' ', 'T') + 'Z');
  return data.toLocaleDateString('pt-BR');
}

router.get('/leitura', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const meusArtigos = articles.listByUser(userId);
  const meusDocumentos = documents.listByUser(userId).map((doc) => ({
    ...doc,
    destaques: highlights.listByDocument(doc.id, userId),
    tamanhoFormatado: formatarTamanho(doc.file_size),
    dataFormatada: formatarData(doc.created_at),
  }));

  res.render('leitura', { meusArtigos, meusDocumentos });
});

router.post('/api/documentos', requireAuth, (req, res) => {
  upload.single('pdf')(req, res, (erroUpload) => {
    if (erroUpload) {
      return res.status(400).json({ erro: erroUpload.message || 'Não foi possível enviar o arquivo.' });
    }

    const userId = req.session.userId;
    const titulo = (req.body.title || '').trim();
    const articleId = req.body.articleId ? Number.parseInt(req.body.articleId, 10) : null;

    if (!titulo) {
      return res.status(400).json({ erro: 'Informe um título para o documento.' });
    }
    if (!req.file) {
      return res.status(400).json({ erro: 'Envie um arquivo PDF.' });
    }

    if (articleId) {
      const artigo = articles.findById(articleId);
      if (!artigo || artigo.user_id !== userId) {
        return res.status(400).json({ erro: 'Artigo inválido.' });
      }
    }

    const filePath = `${userId}/${req.file.filename}`;
    const documento = documents.create({
      userId,
      articleId,
      title: titulo,
      filePath,
      fileSize: req.file.size,
    });
    res.status(201).json({ documento });
  });
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

// Serve o arquivo guardado pra ser lido de novo (o navegador busca isso e
// carrega no PDF.js, retomando a leitura sem precisar reenviar o PDF).
router.get('/documentos/:id/arquivo', requireAuth, (req, res) => {
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== req.session.userId) {
    return res.status(404).send('Documento não encontrado.');
  }
  if (!documento.file_path) {
    return res
      .status(404)
      .send('Esse documento foi enviado antes de guardarmos o arquivo original — envie o PDF de novo.');
  }

  const caminhoAbsoluto = path.join(PASTA_UPLOADS, documento.file_path);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nomeArquivoSeguro(documento.title)}.pdf"`);
  res.sendFile(caminhoAbsoluto, (erro) => {
    if (erro && !res.headersSent) res.status(404).send('Arquivo não encontrado no servidor.');
  });
});

router.get('/documentos/:id/baixar', requireAuth, (req, res) => {
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== req.session.userId) {
    return res.status(404).send('Documento não encontrado.');
  }
  if (!documento.file_path) {
    return res
      .status(404)
      .send('Esse documento foi enviado antes de guardarmos o arquivo original — envie o PDF de novo.');
  }

  const caminhoAbsoluto = path.join(PASTA_UPLOADS, documento.file_path);
  res.download(caminhoAbsoluto, `${nomeArquivoSeguro(documento.title)}.pdf`, (erro) => {
    if (erro && !res.headersSent) res.status(404).send('Arquivo não encontrado no servidor.');
  });
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
