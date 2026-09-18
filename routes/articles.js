const express = require('express');
const { requireAuth } = require('../middleware/auth');
const articles = require('../db/articles');
const { similaridadeTitulos } = require('../utils/similaridade');
const { t, CSV_DELIMITADOR_POR_IDIOMA } = require('../utils/i18n');

const router = express.Router();

const SEMANTIC_SCHOLAR_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CAMPOS_BUSCA = 'title,abstract,year,authors,venue,externalIds,url,openAccessPdf';
const LIMITE_RESULTADOS = 100; // maximo permitido pela API por chamada

// Tipos de publicacao que a Semantic Scholar realmente reconhece e permite
// filtrar (campo publicationTypes). So aceitamos esses valores no filtro pra
// nao mandar lixo pra frente pra API.
const TIPOS_PUBLICACAO_VALIDOS = new Set([
  'JournalArticle',
  'Conference',
  'Review',
  'Book',
  'BookSection',
  'CaseReport',
]);

// A partir desse grau de sobreposicao de palavras no titulo, avisamos que pode ser duplicata.
const LIMIAR_SIMILARIDADE = 0.6;

// Acha, entre os artigos ja salvos do usuario, um que pareca ser o mesmo
// artigo (mesmo DOI, ou titulo muito parecido). Usado tanto pra avisar antes
// mesmo de tentar salvar (na busca) quanto pra bloquear o salvamento mesmo.
function encontrarSalvoParecido(salvos, { title, doi }) {
  const doiLimpo = doi ? String(doi).trim().toLowerCase() : null;
  if (doiLimpo) {
    const porDoi = salvos.find((artigo) => artigo.doi && artigo.doi.toLowerCase() === doiLimpo);
    if (porDoi) return porDoi;
  }
  return salvos.find((artigo) => similaridadeTitulos(artigo.title, title) >= LIMIAR_SIMILARIDADE) || null;
}

router.get('/artigos', requireAuth, (req, res) => {
  res.render('artigos', { queryInicial: req.query.q || '' });
});

// Busca um PDF externo (link de acesso aberto) pelo nosso servidor e devolve
// pro navegador. Isso resolve dois problemas: 1) o navegador so respeita o
// atributo "download" em links do mesmo site, entao pra baixar de verdade um
// PDF de outro site precisamos ser nos a entregar o arquivo; 2) o PDF.js so
// consegue ler um PDF de outro dominio se o dono do site liberar isso
// (CORS), o que a maioria nao faz — passando pelo nosso servidor, o
// navegador ve o arquivo como se fosse nosso.
router.get('/pdf-externo', requireAuth, async (req, res) => {
  const urlOriginal = req.query.url;
  const querBaixar = Boolean(req.query.baixar);
  if (!urlOriginal || !/^https?:\/\//i.test(urlOriginal)) {
    return res.status(400).send(res.locals.t('articles.erroLinkInvalido'));
  }

  // Alguns sites bloqueiam pedidos feitos por servidor (proteção antirrobô) mas
  // funcionam normalmente quando é o navegador da pessoa quem acessa. Nesse
  // caso, se a intenção era baixar, mandamos direto pro site original em vez
  // de mostrar um erro — o navegador tenta de novo, agora como uma visita
  // normal.
  let respostaExterna;
  try {
    respostaExterna = await fetch(urlOriginal);
  } catch (err) {
    if (querBaixar) return res.redirect(urlOriginal);
    return res.status(502).send(res.locals.t('articles.erroFalhaDownload'));
  }
  if (!respostaExterna.ok) {
    if (querBaixar) return res.redirect(urlOriginal);
    return res.status(502).send(res.locals.t('articles.erroSiteNaoRespondeu'));
  }

  const conteudo = Buffer.from(await respostaExterna.arrayBuffer());

  // Alguns sites respondem "200 OK" (ou outro status de sucesso) mas mandam
  // uma pagina de verificacao antirrobo no lugar do arquivo — nao um erro
  // HTTP, entao o "if (!ok)" acima nao pega esse caso. Um PDF de verdade
  // sempre comeca com os bytes "%PDF", entao conferimos isso tambem.
  const pareceComUmPdf = conteudo.length > 4 && conteudo.subarray(0, 4).toString('latin1') === '%PDF';
  if (!pareceComUmPdf) {
    if (querBaixar) return res.redirect(urlOriginal);
    return res.status(502).send(res.locals.t('articles.erroBloqueadoRobo'));
  }

  const disposicao = querBaixar ? 'attachment' : 'inline';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${disposicao}; filename="artigo.pdf"`);
  res.send(conteudo);
});

router.get('/biblioteca', requireAuth, (req, res) => {
  const salvos = articles.listByUser(req.session.userId);
  res.render('biblioteca', { salvos });
});

router.get('/api/artigos/buscar', requireAuth, async (req, res) => {
  const query = (req.query.q || '').trim();
  const offset = Number.parseInt(req.query.offset, 10) || 0;
  if (!query) {
    return res.status(400).json({ erro: res.locals.t('articles.erroTermoBusca') });
  }

  const url = new URL(SEMANTIC_SCHOLAR_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('fields', CAMPOS_BUSCA);
  url.searchParams.set('limit', String(LIMITE_RESULTADOS));
  url.searchParams.set('offset', String(offset));

  // Filtro por ano (intervalo). A Semantic Scholar aceita "2020-2023",
  // "2020-" (a partir de) ou "-2023" (ate).
  const anoDe = (req.query.anoDe || '').trim();
  const anoAte = (req.query.anoAte || '').trim();
  if (anoDe || anoAte) {
    url.searchParams.set('year', `${anoDe}-${anoAte}`);
  }

  // Filtro por tipo de publicacao (varios valores, separados por virgula).
  const tiposPedidos = (req.query.tipos || '').split(',').map((t) => t.trim());
  const tiposValidos = tiposPedidos.filter((t) => TIPOS_PUBLICACAO_VALIDOS.has(t));
  if (tiposValidos.length > 0) {
    url.searchParams.set('publicationTypes', tiposValidos.join(','));
  }

  // Com uma chave gratuita (SEMANTIC_SCHOLAR_API_KEY no .env), a Semantic Scholar
  // usa uma cota so nossa em vez de nos colocar na fila compartilhada com o resto
  // da internet. Sem a chave, a busca continua funcionando normalmente.
  const cabecalhos = process.env.SEMANTIC_SCHOLAR_API_KEY
    ? { 'x-api-key': process.env.SEMANTIC_SCHOLAR_API_KEY }
    : undefined;

  let resposta;
  try {
    resposta = await fetch(url, { headers: cabecalhos });
  } catch (err) {
    return res.status(502).json({ erro: res.locals.t('articles.erroConexaoSemanticScholar') });
  }

  if (resposta.status === 429) {
    return res.status(429).json({ erro: res.locals.t('articles.erroMuitasBuscas') });
  }
  if (!resposta.ok) {
    return res.status(502).json({ erro: res.locals.t('articles.erroSemanticScholarInvalido') });
  }

  const dados = await resposta.json();
  const salvos = articles.listByUser(req.session.userId);
  const resultados = (dados.data || []).map((artigo) => {
    const titulo = artigo.title || res.locals.t('articles.semTitulo');
    const doi = artigo.externalIds && artigo.externalIds.DOI ? artigo.externalIds.DOI : null;
    const parecido = encontrarSalvoParecido(salvos, { title: titulo, doi });
    return {
      title: titulo,
      abstract: artigo.abstract || '',
      year: artigo.year || null,
      venue: artigo.venue || '',
      authors: (artigo.authors || []).map((autor) => autor.name).join(', '),
      doi,
      url: artigo.url || null,
      pdfAberto: artigo.openAccessPdf ? artigo.openAccessPdf.url : null,
      jaSalvo: !!parecido,
    };
  });

  res.json({
    resultados,
    total: dados.total || 0,
    proximoOffset: typeof dados.next === 'number' ? dados.next : null,
  });
});

router.post('/api/artigos/salvar', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const { title, abstract, year, venue, authors, doi, url, pdfAberto, forcar } = req.body;

  const tituloLimpo = (title || '').trim();
  if (!tituloLimpo) {
    return res.status(400).json({ erro: res.locals.t('articles.erroSemTitulo') });
  }

  const salvos = articles.listByUser(userId);
  const parecido = encontrarSalvoParecido(salvos, { title: tituloLimpo, doi });

  if (parecido && !forcar) {
    return res.status(409).json({
      duplicado: true,
      mensagem: res.locals.t('articles.mensagemDuplicado', { titulo: parecido.title }),
    });
  }

  const anoNumero = Number.parseInt(year, 10);
  const criado = articles.create({
    userId,
    title: tituloLimpo,
    abstract,
    year: Number.isFinite(anoNumero) ? anoNumero : null,
    venue,
    authors,
    doi,
    url,
    pdfUrl: pdfAberto,
  });

  res.status(201).json({ artigo: criado });
});

router.post('/artigos/:id/remover', requireAuth, (req, res) => {
  articles.remove(req.params.id, req.session.userId);
  res.redirect('/biblioteca');
});

router.get('/artigos/exportar.csv', requireAuth, (req, res) => {
  const salvos = articles.listByUser(req.session.userId);
  const csv = gerarCsv(salvos, res.locals.lang);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="artigos-salvos.csv"');
  res.send(csv);
});

function campoCsv(valor, delimitador) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const precisaAspas = new RegExp(`["${delimitador}\r\n]`).test(texto);
  if (precisaAspas) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

// O separador varia por idioma porque o Excel em portugues/espanhol trata ","
// como separador decimal e espera ";" pra separar colunas - com virgula, ele
// abria tudo numa coluna so. Em ingles, "," e o padrao normal.
function gerarCsv(listaArtigos, lang) {
  const delimitador = CSV_DELIMITADOR_POR_IDIOMA[lang];
  const cabecalho = [
    t(lang, 'csv.articles.title'),
    t(lang, 'csv.articles.authors'),
    t(lang, 'csv.articles.year'),
    t(lang, 'csv.articles.venue'),
    t(lang, 'csv.articles.doi'),
    t(lang, 'csv.articles.link'),
    t(lang, 'csv.articles.openAccessPdf'),
    t(lang, 'csv.articles.abstract'),
  ];
  const linhas = [cabecalho.join(delimitador)];
  for (const artigo of listaArtigos) {
    linhas.push(
      [
        campoCsv(artigo.title, delimitador),
        campoCsv(artigo.authors, delimitador),
        campoCsv(artigo.year, delimitador),
        campoCsv(artigo.venue, delimitador),
        campoCsv(artigo.doi, delimitador),
        campoCsv(artigo.url, delimitador),
        campoCsv(artigo.pdf_url, delimitador),
        campoCsv(artigo.abstract, delimitador),
      ].join(delimitador)
    );
  }
  // ﻿ (BOM) garante que o Excel abra os acentos corretamente.
  return '﻿' + linhas.join('\r\n');
}

module.exports = router;
