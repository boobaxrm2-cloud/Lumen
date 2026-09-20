const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const forum = require('../db/forum');
const users = require('../db/users');
const notifications = require('../db/notifications');
const { t, idiomaValido } = require('../utils/i18n');

const router = express.Router();

const PASTA_UPLOADS = require('../db/uploads-dir');
const LIMITE_TAMANHO_ANEXO = 30 * 1024 * 1024; // 30 MB, mesmo limite ja usado pra PDF em routes/reading.js
const MAX_ANEXOS_POR_POST = 10;
const TIPOS_ANEXO_VALIDOS = {
  'application/pdf': { extensao: '.pdf', kind: 'pdf' },
  'image/jpeg': { extensao: '.jpg', kind: 'imagem' },
  'image/png': { extensao: '.png', kind: 'imagem' },
  'image/webp': { extensao: '.webp', kind: 'imagem' },
};

// Anexos do forum ficam em uploads/<userId>/forum/, mesmo padrao de pasta
// por usuario ja usado pros PDFs de leitura e pra foto de perfil.
const armazenamentoAnexo = multer.diskStorage({
  destination: (req, file, callback) => {
    const pasta = path.join(PASTA_UPLOADS, String(req.session.userId), 'forum');
    fs.mkdirSync(pasta, { recursive: true });
    callback(null, pasta);
  },
  filename: (req, file, callback) => {
    const extensao = (TIPOS_ANEXO_VALIDOS[file.mimetype] || {}).extensao || '';
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`);
  },
});

const uploadAnexos = multer({
  storage: armazenamentoAnexo,
  limits: { fileSize: LIMITE_TAMANHO_ANEXO },
  fileFilter: (req, file, callback) => {
    if (!TIPOS_ANEXO_VALIDOS[file.mimetype]) {
      const lang = idiomaValido(req.cookies.idioma);
      return callback(new Error(t(lang, 'forum.erroAnexoTipoInvalido')));
    }
    callback(null, true);
  },
});

// Cria as linhas de forum_attachments a partir dos arquivos que o multer ja
// salvou em disco (req.files), associando a um topico OU a uma resposta.
function salvarAnexos(req, { topicId, replyId }) {
  (req.files || []).forEach((arquivo) => {
    const info = TIPOS_ANEXO_VALIDOS[arquivo.mimetype] || { kind: 'imagem' };
    forum.createAttachment({
      topicId: topicId || null,
      replyId: replyId || null,
      filePath: `${req.session.userId}/forum/${arquivo.filename}`,
      originalName: arquivo.originalname,
      kind: info.kind,
    });
  });
}

function listarTopicosParaView(req, res, q) {
  return forum.listTopics({ q }).map((topico) => ({
    ...topico,
    podeGerenciar: req.session.userId === topico.user_id || res.locals.isAdmin,
  }));
}

router.get('/forum', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  const topicos = listarTopicosParaView(req, res, q);
  res.render('forum', { topicos, q, erroNovoTopico: null });
});

router.post('/forum/topicos', requireAuth, (req, res) => {
  uploadAnexos.array('anexos', MAX_ANEXOS_POR_POST)(req, res, (erroUpload) => {
    if (erroUpload) {
      const topicos = listarTopicosParaView(req, res, '');
      return res
        .status(400)
        .render('forum', { topicos, q: '', erroNovoTopico: erroUpload.message || res.locals.t('forum.erroCriarTopico') });
    }

    const titulo = (req.body.title || '').trim();
    const mensagem = (req.body.message || '').trim();

    if (!titulo || !mensagem) {
      const topicos = listarTopicosParaView(req, res, '');
      return res.status(400).render('forum', { topicos, q: '', erroNovoTopico: res.locals.t('forum.erroCamposObrigatorios') });
    }

    const topico = forum.createTopic({ userId: req.session.userId, title: titulo, message: mensagem });
    salvarAnexos(req, { topicId: topico.id });

    res.redirect(`/forum/topicos/${topico.id}`);
  });
});

router.get('/forum/topicos/:id', requireAuth, (req, res) => {
  const topico = forum.findTopicById(req.params.id);
  if (!topico) {
    return res.status(404).send(res.locals.t('forum.erroTopicoNaoEncontrado'));
  }

  const anexosTopico = forum.listAttachmentsByTopic(topico.id);
  const respostas = forum.listRepliesByTopic(topico.id).map((resposta) => ({
    ...resposta,
    anexos: forum.listAttachmentsByReply(resposta.id),
    podeGerenciar: req.session.userId === resposta.user_id || res.locals.isAdmin,
  }));

  res.render('forum-topico', {
    topico,
    anexosTopico,
    respostas,
    podeGerenciarTopico: req.session.userId === topico.user_id || res.locals.isAdmin,
  });
});

router.post('/forum/topicos/:id/editar', requireAuth, (req, res) => {
  const topico = forum.findTopicById(req.params.id);
  if (!topico || (req.session.userId !== topico.user_id && !res.locals.isAdmin)) {
    return res.status(404).send(res.locals.t('forum.erroTopicoNaoEncontrado'));
  }

  const titulo = (req.body.title || '').trim();
  const mensagem = (req.body.message || '').trim();
  if (titulo && mensagem) {
    forum.updateTopic(topico.id, { title: titulo, message: mensagem });
  }
  res.redirect(`/forum/topicos/${topico.id}`);
});

router.post('/forum/topicos/:id/excluir', requireAuth, (req, res) => {
  const topico = forum.findTopicById(req.params.id);
  if (!topico || (req.session.userId !== topico.user_id && !res.locals.isAdmin)) {
    return res.status(404).send(res.locals.t('forum.erroTopicoNaoEncontrado'));
  }
  forum.removeTopic(topico.id);
  res.redirect('/forum');
});

router.post('/forum/topicos/:id/respostas', requireAuth, (req, res) => {
  const topico = forum.findTopicById(req.params.id);
  if (!topico) {
    return res.status(404).send(res.locals.t('forum.erroTopicoNaoEncontrado'));
  }

  uploadAnexos.array('anexos', MAX_ANEXOS_POR_POST)(req, res, (erroUpload) => {
    if (erroUpload) {
      return res.redirect(`/forum/topicos/${topico.id}`);
    }

    const mensagem = (req.body.message || '').trim();
    if (!mensagem) {
      return res.redirect(`/forum/topicos/${topico.id}`);
    }

    const resposta = forum.createReply({ topicId: topico.id, userId: req.session.userId, message: mensagem });
    salvarAnexos(req, { replyId: resposta.id });

    notifications.create({
      userId: topico.user_id,
      actorUserId: req.session.userId,
      type: 'forum_reply',
      topicId: topico.id,
      link: `/forum/topicos/${topico.id}`,
    });

    res.redirect(`/forum/topicos/${topico.id}#resposta-${resposta.id}`);
  });
});

router.post('/forum/respostas/:id/editar', requireAuth, (req, res) => {
  const resposta = forum.findReplyById(req.params.id);
  if (!resposta || (req.session.userId !== resposta.user_id && !res.locals.isAdmin)) {
    return res.status(404).send(res.locals.t('forum.erroRespostaNaoEncontrada'));
  }
  const mensagem = (req.body.message || '').trim();
  if (mensagem) {
    forum.updateReply(resposta.id, mensagem);
  }
  res.redirect(`/forum/topicos/${resposta.topic_id}#resposta-${resposta.id}`);
});

router.post('/forum/respostas/:id/excluir', requireAuth, (req, res) => {
  const resposta = forum.findReplyById(req.params.id);
  if (!resposta || (req.session.userId !== resposta.user_id && !res.locals.isAdmin)) {
    return res.status(404).send(res.locals.t('forum.erroRespostaNaoEncontrada'));
  }
  const topicId = resposta.topic_id;
  forum.removeReply(resposta.id);
  res.redirect(`/forum/topicos/${topicId}`);
});

router.get('/forum/anexos/:id', requireAuth, (req, res) => {
  const anexo = forum.findAttachmentById(req.params.id);
  if (!anexo) {
    return res.status(404).send(res.locals.t('forum.erroAnexoNaoEncontrado'));
  }
  const caminhoAbsoluto = path.join(PASTA_UPLOADS, anexo.file_path);
  res.sendFile(caminhoAbsoluto, (erro) => {
    if (erro && !res.headersSent) res.status(404).send(res.locals.t('forum.erroAnexoNaoEncontrado'));
  });
});

// Foto de perfil de qualquer usuario (nao so a propria) - usada nos cards de
// autor do forum. GET /conta/foto (routes/auth.js) so serve a propria foto.
router.get('/usuarios/:id/foto', requireAuth, (req, res) => {
  const usuario = users.findById(req.params.id);
  if (!usuario || !usuario.avatar_path) {
    return res.status(404).send(res.locals.t('account.erroFotoNaoEncontrada'));
  }
  const caminhoAbsoluto = path.join(PASTA_UPLOADS, usuario.avatar_path);
  res.sendFile(caminhoAbsoluto, (erro) => {
    if (erro && !res.headersSent) res.status(404).send(res.locals.t('account.erroFotoNaoEncontrada'));
  });
});

module.exports = router;
