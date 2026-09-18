const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { requireAuth } = require('../middleware/auth');
const documents = require('../db/documents');
const highlights = require('../db/highlights');
const articles = require('../db/articles');
const { t, idiomaValido, LOCALE_POR_IDIOMA } = require('../utils/i18n');

const router = express.Router();

const PASTA_UPLOADS = require('../db/uploads-dir');
const LIMITE_TAMANHO_ARQUIVO = 30 * 1024 * 1024; // 30 MB
const LOGO_LUMEN = path.join(__dirname, '..', 'public', 'images', 'logo-lumen.png');

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
      const lang = idiomaValido(req.cookies.idioma);
      return callback(new Error(t(lang, 'reading.onlyPdfError')));
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

function formatarData(dataIso, lang) {
  const data = new Date(dataIso.replace(' ', 'T') + 'Z');
  return data.toLocaleDateString(LOCALE_POR_IDIOMA[lang]);
}

router.get('/leitura', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const meusArtigos = articles.listByUser(userId);
  const meusDocumentos = documents.listByUser(userId).map((doc) => ({
    ...doc,
    destaques: highlights.listByDocument(doc.id, userId),
    tamanhoFormatado: formatarTamanho(doc.file_size),
    dataFormatada: formatarData(doc.created_at, res.locals.lang),
  }));

  res.render('leitura', { meusArtigos, meusDocumentos });
});

router.post('/api/documentos', requireAuth, (req, res) => {
  upload.single('pdf')(req, res, (erroUpload) => {
    if (erroUpload) {
      return res.status(400).json({ erro: erroUpload.message || res.locals.t('reading.uploadErrorGeneric') });
    }

    const userId = req.session.userId;
    const titulo = (req.body.title || '').trim();
    const articleId = req.body.articleId ? Number.parseInt(req.body.articleId, 10) : null;

    if (!titulo) {
      return res.status(400).json({ erro: res.locals.t('reading.erroTituloObrigatorio') });
    }
    if (!req.file) {
      return res.status(400).json({ erro: res.locals.t('reading.erroArquivoObrigatorio') });
    }

    if (articleId) {
      const artigo = articles.findById(articleId);
      if (!artigo || artigo.user_id !== userId) {
        return res.status(400).json({ erro: res.locals.t('reading.erroArtigoInvalido') });
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
    return res.status(400).json({ erro: res.locals.t('reading.erroSelecioneTrecho') });
  }

  const documento = documents.findById(documentId);
  if (!documento || documento.user_id !== userId) {
    return res.status(404).json({ erro: res.locals.t('reading.erroDocumentoNaoEncontrado') });
  }

  const destaque = highlights.create({ documentId, userId, excerpt: texto });
  res.status(201).json({ destaque });
});

const LIMITE_TAMANHO_RECORTE = 8 * 1024 * 1024; // 8 MB, ja em base64

// Recebe o recorte de imagem (recortado no navegador a partir do canvas da
// pagina) como um data URL em base64, salva o arquivo em disco (do mesmo
// jeito que os PDFs) e cria um trecho-chave do tipo "imagem".
router.post('/api/documentos/:id/destaques-imagem', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const documentId = Number.parseInt(req.params.id, 10);
  const { imageDataUrl, caption, pageNumber } = req.body;

  const documento = documents.findById(documentId);
  if (!documento || documento.user_id !== userId) {
    return res.status(404).json({ erro: res.locals.t('reading.erroDocumentoNaoEncontrado') });
  }

  const correspondencia = /^data:image\/png;base64,(.+)$/.exec(imageDataUrl || '');
  if (!correspondencia) {
    return res.status(400).json({ erro: res.locals.t('reading.erroRecorteInvalido') });
  }

  const bytes = Buffer.from(correspondencia[1], 'base64');
  if (bytes.length === 0) {
    return res.status(400).json({ erro: res.locals.t('reading.erroRecorteVazio') });
  }
  if (bytes.length > LIMITE_TAMANHO_RECORTE) {
    return res.status(400).json({ erro: res.locals.t('reading.erroRecorteGrande') });
  }

  const pastaUsuario = path.join(PASTA_UPLOADS, String(userId), 'recortes');
  fs.mkdirSync(pastaUsuario, { recursive: true });
  const nomeArquivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  fs.writeFileSync(path.join(pastaUsuario, nomeArquivo), bytes);

  const destaque = highlights.create({
    documentId,
    userId,
    type: 'imagem',
    excerpt: (caption || '').trim(),
    imagePath: `${userId}/recortes/${nomeArquivo}`,
    pageNumber: pageNumber ? Number.parseInt(pageNumber, 10) : null,
  });
  res.status(201).json({ destaque });
});

// Serve o recorte de imagem de um trecho-chave.
router.get('/destaques/:id/imagem', requireAuth, (req, res) => {
  const destaque = highlights.findById(req.params.id);
  if (!destaque || destaque.user_id !== req.session.userId || !destaque.image_path) {
    return res.status(404).send(res.locals.t('reading.erroImagemNaoEncontrada'));
  }

  const caminhoAbsoluto = path.join(PASTA_UPLOADS, destaque.image_path);
  res.sendFile(caminhoAbsoluto, (erro) => {
    if (erro && !res.headersSent) res.status(404).send(res.locals.t('reading.erroArquivoNaoEncontrado'));
  });
});

// Serve o arquivo guardado pra ser lido de novo (o navegador busca isso e
// carrega no PDF.js, retomando a leitura sem precisar reenviar o PDF).
router.get('/documentos/:id/arquivo', requireAuth, (req, res) => {
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== req.session.userId) {
    return res.status(404).send(res.locals.t('reading.erroDocumentoNaoEncontrado'));
  }
  if (!documento.file_path) {
    return res.status(404).send(res.locals.t('reading.erroArquivoOriginalAusente'));
  }

  const caminhoAbsoluto = path.join(PASTA_UPLOADS, documento.file_path);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nomeArquivoSeguro(documento.title)}.pdf"`);
  res.sendFile(caminhoAbsoluto, (erro) => {
    if (erro && !res.headersSent) res.status(404).send(res.locals.t('reading.erroArquivoNaoEncontrado'));
  });
});

router.get('/documentos/:id/baixar', requireAuth, (req, res) => {
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== req.session.userId) {
    return res.status(404).send(res.locals.t('reading.erroDocumentoNaoEncontrado'));
  }
  if (!documento.file_path) {
    return res.status(404).send(res.locals.t('reading.erroArquivoOriginalAusente'));
  }

  const caminhoAbsoluto = path.join(PASTA_UPLOADS, documento.file_path);
  res.download(caminhoAbsoluto, `${nomeArquivoSeguro(documento.title)}.pdf`, (erro) => {
    if (erro && !res.headersSent) res.status(404).send(res.locals.t('reading.erroArquivoNaoEncontrado'));
  });
});

router.post('/documentos/:id/remover', requireAuth, (req, res) => {
  documents.remove(req.params.id, req.session.userId);
  res.redirect('/leitura');
});

// Garante espaco suficiente na pagina atual antes de desenhar o proximo
// trecho - se nao couber, comeca uma pagina nova (a faixa do cabecalho e
// redesenhada automaticamente pelo listener "pageAdded").
function garantirEspaco(doc, alturaMinima) {
  const fimDaPagina = doc.page.height - doc.page.margins.bottom;
  if (doc.y + alturaMinima > fimDaPagina) {
    doc.addPage();
    doc.y = ALTURA_FAIXA_CABECALHO + 30;
  }
}

const ALTURA_FAIXA_CABECALHO = 110;

// A logo tem fundo transparente com texto branco - numa pagina branca ela
// meio que some. Por isso desenha uma faixa escura atras dela, do mesmo tom
// do fundo do site, em toda pagina (inclusive as que vem de quebra de pagina).
function desenharFaixaCabecalho(doc) {
  doc.rect(0, 0, doc.page.width, ALTURA_FAIXA_CABECALHO).fill('#0b101d');
  try {
    const larguraLogo = 130;
    const alturaLogo = larguraLogo * (941 / 1671); // proporcao real do arquivo da logo
    doc.image(LOGO_LUMEN, doc.page.margins.left, (ALTURA_FAIXA_CABECALHO - alturaLogo) / 2, {
      width: larguraLogo,
    });
  } catch (erro) {
    // segue sem a logo se o arquivo nao existir por algum motivo
  }
}

// Gera um PDF com a logo da Lumen, o titulo do documento, os dados da
// pesquisa vinculada (se houver) e todos os trechos-chave marcados nele
// (texto e recortes de imagem), pra ele poder levar/imprimir/compartilhar o
// resumo da leitura sem depender do app.
router.get('/documentos/:id/trechos.pdf', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const lang = res.locals.lang;
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== userId) {
    return res.status(404).send(res.locals.t('reading.erroDocumentoNaoEncontrado'));
  }

  const trechos = highlights.listByDocument(documento.id, userId);
  const artigoVinculado = documento.article_id ? articles.findById(documento.article_id) : null;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="trechos-${nomeArquivoSeguro(documento.title)}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  desenharFaixaCabecalho(doc);
  doc.on('pageAdded', () => desenharFaixaCabecalho(doc));

  doc.y = ALTURA_FAIXA_CABECALHO + 30;
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1f2e').text(documento.title);
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(11).fillColor('#444');
  if (artigoVinculado) {
    doc.text(t(lang, 'pdf.pesquisaVinculada', { titulo: artigoVinculado.title }));
    doc.text(t(lang, 'pdf.autores', { autores: artigoVinculado.authors || t(lang, 'pdf.naoInformado') }));
  } else {
    doc.font('Helvetica-Oblique').text(t(lang, 'pdf.semPesquisaVinculada'));
    doc.font('Helvetica');
  }
  doc.text(t(lang, 'pdf.trechosMarcados', { n: trechos.length }));
  doc.text(t(lang, 'pdf.exportadoEm', { data: new Date().toLocaleDateString(LOCALE_POR_IDIOMA[lang]) }));

  doc.moveDown(0.8);
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#d9a52f')
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(1);

  if (trechos.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(12).fillColor('#666').text(t(lang, 'pdf.nenhumTrechoMarcado'));
  }

  trechos.forEach((trecho, indice) => {
    if (trecho.type === 'imagem' && trecho.image_path) {
      garantirEspaco(doc, 220);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1f2e').text(t(lang, 'pdf.recorteDeImagem', { n: indice + 1 }));
      doc.moveDown(0.3);

      const caminhoImagem = path.join(PASTA_UPLOADS, trecho.image_path);
      try {
        const larguraMax = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.image(caminhoImagem, { fit: [larguraMax, 300] });
      } catch (erro) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#999').text(t(lang, 'pdf.imagemNaoCarregada'));
      }
      if (trecho.excerpt) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555').text(trecho.excerpt);
      }
    } else {
      garantirEspaco(doc, 80);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1f2e').text(`${indice + 1}. `, { continued: true });
      doc.font('Helvetica-Oblique').fillColor('#333').text(`"${trecho.excerpt}"`);
    }
    doc.moveDown(1);
  });

  doc.end();
});

router.post('/destaques/:id/remover', requireAuth, (req, res) => {
  highlights.remove(req.params.id, req.session.userId);
  res.redirect('/leitura');
});

module.exports = router;
