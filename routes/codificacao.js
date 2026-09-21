const path = require('node:path');
const express = require('express');
const PDFDocument = require('pdfkit');
const { requireAuth } = require('../middleware/auth');
const codes = require('../db/codes');
const highlights = require('../db/highlights');
const highlightCodes = require('../db/highlight-codes');
const documents = require('../db/documents');
const articles = require('../db/articles');
const { t, LOCALE_POR_IDIOMA, CSV_DELIMITADOR_POR_IDIOMA } = require('../utils/i18n');
const { CORES_CODIGO } = require('../utils/cores-codigo');

const router = express.Router();

const PASTA_UPLOADS = require('../db/uploads-dir');
const LOGO_LUMEN = path.join(__dirname, '..', 'public', 'images', 'logo-lumen.png');
const ALTURA_FAIXA_CABECALHO = 110;

// Lista os documentos do usuario que tem pelo menos um trecho-chave, com a
// contagem de trechos de cada um - usado tanto pra escolher qual codificar
// quanto pra montar a lista de trechos de um documento especifico.
function documentosComTrechos(todosOsTrechos, lang) {
  const mapa = new Map();
  todosOsTrechos.forEach((trecho) => {
    if (!mapa.has(trecho.document_id)) {
      mapa.set(trecho.document_id, { id: trecho.document_id, title: trecho.document_title, total: 0 });
    }
    mapa.get(trecho.document_id).total += 1;
  });
  return Array.from(mapa.values()).sort((a, b) => a.title.localeCompare(b.title, LOCALE_POR_IDIOMA[lang]));
}

router.get('/codificacao', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const todosOsTrechos = highlights.listByUser(userId);
  const documentos = documentosComTrechos(todosOsTrechos, res.locals.lang);

  const documentoId = req.query.documento ? Number.parseInt(req.query.documento, 10) : null;
  const documentoEscolhido = documentoId ? documentos.find((d) => d.id === documentoId) : null;

  if (!documentoEscolhido) {
    return res.render('codificacao', { modoEscolha: true, documentos });
  }

  const contagens = codes.countUsageByDocument(documentoId);
  const meusCodigos = codes.listByDocument(documentoId, userId).map((codigo) => ({
    ...codigo,
    total: contagens.get(codigo.id) || 0,
  }));

  const paresCodigo = highlightCodes.listCodesForUser(userId);
  const codigosPorTrecho = new Map();
  paresCodigo.forEach((par) => {
    if (!codigosPorTrecho.has(par.highlightId)) codigosPorTrecho.set(par.highlightId, []);
    codigosPorTrecho.get(par.highlightId).push({ id: par.id, name: par.name, color: par.color });
  });

  const filtroCodigo = req.query.codigo ? Number.parseInt(req.query.codigo, 10) : null;

  const trechos = todosOsTrechos
    .filter((trecho) => trecho.document_id === documentoId)
    .map((trecho) => ({ ...trecho, codigos: codigosPorTrecho.get(trecho.id) || [] }))
    .filter((trecho) => !filtroCodigo || trecho.codigos.some((c) => c.id === filtroCodigo));

  res.render('codificacao', {
    modoEscolha: false,
    documentos,
    documentoId,
    documentoEscolhido,
    codigos: meusCodigos,
    trechos,
    filtroCodigo,
    coresCodigo: CORES_CODIGO,
  });
});

router.post('/codigos', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const nome = (req.body.name || '').trim();
  const documentId = Number.parseInt(req.body.documentId, 10);
  const cor = CORES_CODIGO.includes(req.body.color) ? req.body.color : CORES_CODIGO[0];

  if (nome && documentId) {
    codes.create({ userId, documentId, name: nome, color: cor });
  }
  res.redirect(`/codificacao?documento=${documentId}`);
});

router.post('/codigos/:id/remover', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const codigo = codes.findById(req.params.id);
  const documentId = codigo ? codigo.document_id : null;

  codes.remove(req.params.id, userId);
  res.redirect(documentId ? `/codificacao?documento=${documentId}` : '/codificacao');
});

router.post('/trechos/:id/alternar-codigo', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const highlightId = Number.parseInt(req.params.id, 10);
  const codeId = Number.parseInt(req.body.codeId, 10);

  const trecho = highlights.findById(highlightId);
  const codigo = codes.findById(codeId);

  // So deixa marcar/desmarcar se o trecho e o codigo forem do mesmo usuario
  // E do mesmo documento - um codigo de uma pesquisa nao pode ser aplicado
  // num trecho de outra.
  if (
    trecho &&
    trecho.user_id === userId &&
    codigo &&
    codigo.user_id === userId &&
    codigo.document_id === trecho.document_id
  ) {
    highlightCodes.toggle(highlightId, codeId);
  }

  const parametros = new URLSearchParams();
  parametros.set('documento', req.body.voltarParaDocumento || (trecho ? trecho.document_id : ''));
  if (req.body.voltarParaCodigo) parametros.set('codigo', req.body.voltarParaCodigo);
  // O #trecho-ID faz o navegador voltar direto pra esse card (em vez do
  // topo da pagina) depois do redirecionamento - senao, a cada codigo
  // marcado/desmarcado a pessoa perdia o lugar onde estava na lista.
  res.redirect(`/codificacao?${parametros.toString()}#trecho-${highlightId}`);
});

function nomeArquivoSeguro(titulo) {
  return (titulo || 'documento').replace(/[^\w.-]+/g, '_').slice(0, 100);
}

// Garante espaco suficiente na pagina atual antes de desenhar o proximo
// item - se nao couber, comeca uma pagina nova (a faixa do cabecalho e
// redesenhada automaticamente pelo listener "pageAdded").
function garantirEspaco(doc, alturaMinima) {
  const fimDaPagina = doc.page.height - doc.page.margins.bottom;
  if (doc.y + alturaMinima > fimDaPagina) {
    doc.addPage();
    doc.y = ALTURA_FAIXA_CABECALHO + 30;
  }
}

// A logo tem fundo transparente com texto branco - numa pagina branca ela
// meio que some. Por isso desenha uma faixa escura atras dela, do mesmo tom
// do fundo do site, em toda pagina (inclusive as que vem de quebra de pagina).
function desenharFaixaCabecalho(doc) {
  doc.rect(0, 0, doc.page.width, ALTURA_FAIXA_CABECALHO).fill('#0b101d');
  try {
    const larguraLogo = 130;
    const alturaLogo = larguraLogo * (941 / 1671);
    doc.image(LOGO_LUMEN, doc.page.margins.left, (ALTURA_FAIXA_CABECALHO - alturaLogo) / 2, {
      width: larguraLogo,
    });
  } catch (erro) {
    // segue sem a logo se o arquivo nao existir por algum motivo
  }
}

function linhaDivisoria(doc) {
  doc
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .strokeColor('#d9a52f')
    .lineWidth(1.5)
    .stroke();
}

// Grafico de barras horizontais simples - um por codigo, com o tamanho da
// barra proporcional a quantos trechos tem aquele codigo, na mesma cor que
// o codigo tem no site. Feito so com retangulos (o pdfkit nao tem grafico
// pronto), suficiente pra dar uma visao rapida de quais temas dominam.
function desenharGraficoBarras(doc, listaCodigos) {
  const maiorContagem = Math.max(...listaCodigos.map((c) => c.total), 1);
  // Soma de quantas vezes cada codigo foi aplicado, no total - a porcentagem
  // de cada barra e calculada em cima desse total (nao do total de trechos,
  // ja que um trecho pode ter mais de um codigo).
  const totalAplicacoes = listaCodigos.reduce((soma, c) => soma + c.total, 0);
  const larguraTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const larguraLabel = 150;
  const larguraContagem = 65;
  const larguraBarraMax = larguraTotal - larguraLabel - larguraContagem;
  const alturaBarra = 16;
  const espacamento = 10;

  listaCodigos.forEach((codigo) => {
    garantirEspaco(doc, alturaBarra + espacamento);
    const y = doc.y;
    const larguraBarra = Math.max(4, (codigo.total / maiorContagem) * larguraBarraMax);
    const percentual = totalAplicacoes > 0 ? Math.round((codigo.total / totalAplicacoes) * 100) : 0;

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333')
      .text(codigo.name, doc.page.margins.left, y + 3, { width: larguraLabel - 8, ellipsis: true });

    doc.rect(doc.page.margins.left + larguraLabel, y, larguraBarra, alturaBarra).fill(codigo.color);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#333')
      .text(`${codigo.total} (${percentual}%)`, doc.page.margins.left + larguraLabel + larguraBarra + 6, y + 3);

    doc.y = y + alturaBarra + espacamento;
  });

  // As linhas do grafico usam .text() com x explicito (pra alinhar rotulo,
  // barra e numero), o que deixa o cursor "x" do pdfkit fora da margem
  // esquerda - sem repor aqui, o proximo texto normal (sem x/y explicitos)
  // herda essa posicao e sai espremido numa coluna estreita do lado direito.
  doc.x = doc.page.margins.left;
}

// PDF com a logo, os dados da pesquisa vinculada (se houver), um dashboard
// (grafico de barras com a frequencia de cada codigo) e, na sequencia, cada
// trecho marcado com os codigos que ele recebeu - tudo de uma pesquisa so.
router.get('/documentos/:id/dashboard.pdf', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const lang = res.locals.lang;
  const documento = documents.findById(req.params.id);
  if (!documento || documento.user_id !== userId) {
    return res.status(404).send(res.locals.t('reading.erroDocumentoNaoEncontrado'));
  }

  const documentoId = documento.id;
  const contagens = codes.countUsageByDocument(documentoId);
  const meusCodigos = codes.listByDocument(documentoId, userId).map((codigo) => ({
    ...codigo,
    total: contagens.get(codigo.id) || 0,
  }));

  const paresCodigo = highlightCodes.listCodesForUser(userId);
  const codigosPorTrecho = new Map();
  paresCodigo.forEach((par) => {
    if (!codigosPorTrecho.has(par.highlightId)) codigosPorTrecho.set(par.highlightId, []);
    codigosPorTrecho.get(par.highlightId).push(par.name);
  });

  const trechos = highlights
    .listByDocument(documentoId, userId)
    .map((trecho) => ({ ...trecho, nomesCodigos: codigosPorTrecho.get(trecho.id) || [] }));

  const artigoVinculado = documento.article_id ? articles.findById(documento.article_id) : null;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="dashboard-${nomeArquivoSeguro(documento.title)}.pdf"`
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
  doc.text(t(lang, 'pdf.exportadoEm', { data: new Date().toLocaleDateString(LOCALE_POR_IDIOMA[lang]) }));

  doc.moveDown(0.8);
  linhaDivisoria(doc);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1f2e').text(t(lang, 'pdf.dashboardDeCodificacao'));
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor('#444');
  doc.text(t(lang, 'pdf.totalTrechosMarcados', { n: trechos.length }));
  doc.text(t(lang, 'pdf.totalCodigosCriados', { n: meusCodigos.length }));
  doc.moveDown(0.8);

  if (meusCodigos.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('#666').text(t(lang, 'pdf.nenhumCodigoCriado'));
  } else {
    desenharGraficoBarras(doc, meusCodigos);
  }

  doc.moveDown(1.5);
  garantirEspaco(doc, 60);
  linhaDivisoria(doc);
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1f2e').text(t(lang, 'pdf.trechosMarcadosECodificados'));
  doc.moveDown(0.6);

  if (trechos.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(12).fillColor('#666').text(t(lang, 'pdf.nenhumTrechoMarcado'));
  }

  trechos.forEach((trecho, indice) => {
    const codigosTexto = trecho.nomesCodigos.length > 0 ? trecho.nomesCodigos.join(', ') : t(lang, 'pdf.semCodigo');

    if (trecho.type === 'imagem' && trecho.image_path) {
      garantirEspaco(doc, 240);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1f2e').text(t(lang, 'pdf.recorteDeImagem', { n: indice + 1 }));
      doc.moveDown(0.3);

      const caminhoImagem = path.join(PASTA_UPLOADS, trecho.image_path);
      try {
        const larguraMax = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.image(caminhoImagem, { fit: [larguraMax, 260] });
      } catch (erro) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#999').text(t(lang, 'pdf.imagemNaoCarregada'));
      }
      if (trecho.excerpt) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555').text(trecho.excerpt);
      }
    } else {
      garantirEspaco(doc, 90);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1f2e').text(`${indice + 1}. `, { continued: true });
      doc.font('Helvetica-Oblique').fillColor('#333').text(`"${trecho.excerpt}"`);
    }

    doc.font('Helvetica').fontSize(9).fillColor('#4caf82').text(t(lang, 'pdf.codigos', { lista: codigosTexto }));
    doc.moveDown(1);
  });

  doc.end();
});

router.get('/codificacao/exportar.csv', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const paresCodigo = highlightCodes.listCodesForUser(userId);
  const idsPorTrecho = new Map();
  const nomesPorTrecho = new Map();
  paresCodigo.forEach((par) => {
    if (!idsPorTrecho.has(par.highlightId)) {
      idsPorTrecho.set(par.highlightId, []);
      nomesPorTrecho.set(par.highlightId, []);
    }
    idsPorTrecho.get(par.highlightId).push(par.id);
    nomesPorTrecho.get(par.highlightId).push(par.name);
  });

  const filtroCodigo = req.query.codigo ? Number.parseInt(req.query.codigo, 10) : null;
  const filtroDocumento = req.query.documento ? Number.parseInt(req.query.documento, 10) : null;

  const trechos = highlights
    .listByUser(userId)
    .filter((trecho) => !filtroCodigo || (idsPorTrecho.get(trecho.id) || []).includes(filtroCodigo))
    .filter((trecho) => !filtroDocumento || trecho.document_id === filtroDocumento);
  const csv = gerarCsv(trechos, nomesPorTrecho, res.locals.lang);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="codificacao.csv"');
  res.send(csv);
});

function campoCsv(valor, delimitador) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  // Precisa entrar entre aspas se tiver o separador de coluna, aspas ou
  // qualquer quebra de linha (\r e/ou \n) - um trecho de texto copiado do
  // PDF pode vir com quebras de linha no meio, e sem isso o Excel abre cada
  // linha do trecho como se fosse uma linha nova da planilha.
  const precisaAspas = new RegExp(`["${delimitador}\r\n]`).test(texto);
  if (precisaAspas) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

// O separador varia por idioma porque o Excel em portugues/espanhol trata ","
// como separador decimal e espera ";" pra separar colunas - com virgula, ele
// abria tudo numa coluna so. Em ingles, "," e o padrao normal.
function gerarCsv(trechos, codigosPorTrecho, lang) {
  const delimitador = CSV_DELIMITADOR_POR_IDIOMA[lang];
  const cabecalho = [
    t(lang, 'csv.coding.excerpt'),
    t(lang, 'csv.coding.document'),
    t(lang, 'csv.coding.codes'),
    t(lang, 'csv.coding.date'),
  ];
  const linhas = [cabecalho.join(delimitador)];
  for (const trecho of trechos) {
    const codigosTexto = (codigosPorTrecho.get(trecho.id) || []).join(', ');
    const trechoTexto =
      trecho.type === 'imagem'
        ? `${t(lang, 'csv.coding.imageCropPrefix')} ${trecho.excerpt || ''}`.trim()
        : trecho.excerpt;
    linhas.push(
      [
        campoCsv(trechoTexto, delimitador),
        campoCsv(trecho.document_title, delimitador),
        campoCsv(codigosTexto, delimitador),
        campoCsv(trecho.created_at, delimitador),
      ].join(delimitador)
    );
  }
  // O BOM (﻿) no comeco garante que o Excel reconheca o arquivo como
  // UTF-8 e mostre os acentos certinho, em vez de trocar "ó" por "Ã³" etc.
  return '﻿' + linhas.join('\r\n');
}

module.exports = router;
