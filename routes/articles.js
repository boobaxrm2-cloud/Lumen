const express = require('express');
const { requireAuth } = require('../middleware/auth');
const articles = require('../db/articles');
const { similaridadeTitulos } = require('../utils/similaridade');

const router = express.Router();

const SEMANTIC_SCHOLAR_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CAMPOS_BUSCA = 'title,abstract,year,authors,venue,externalIds,url,openAccessPdf';
const LIMITE_RESULTADOS = 20;

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
    return res.status(400).send('Link de PDF invalido.');
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
    return res.status(502).send('Nao foi possivel baixar esse PDF agora.');
  }
  if (!respostaExterna.ok) {
    if (querBaixar) return res.redirect(urlOriginal);
    return res.status(502).send('O site do PDF nao respondeu corretamente.');
  }

  const conteudo = Buffer.from(await respostaExterna.arrayBuffer());

  // Alguns sites respondem "200 OK" (ou outro status de sucesso) mas mandam
  // uma pagina de verificacao antirrobo no lugar do arquivo — nao um erro
  // HTTP, entao o "if (!ok)" acima nao pega esse caso. Um PDF de verdade
  // sempre comeca com os bytes "%PDF", entao conferimos isso tambem.
  const pareceComUmPdf = conteudo.length > 4 && conteudo.subarray(0, 4).toString('latin1') === '%PDF';
  if (!pareceComUmPdf) {
    if (querBaixar) return res.redirect(urlOriginal);
    return res.status(502).send('O site do PDF bloqueou o acesso automatico. Tente abrir o link original.');
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
    return res.status(400).json({ erro: 'Informe um termo de busca.' });
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
    return res.status(502).json({ erro: 'Nao foi possivel conectar ao Semantic Scholar. Tente novamente.' });
  }

  if (resposta.status === 429) {
    return res.status(429).json({ erro: 'Muitas buscas em pouco tempo. Aguarde alguns segundos e tente de novo.' });
  }
  if (!resposta.ok) {
    return res.status(502).json({ erro: 'O Semantic Scholar nao respondeu corretamente. Tente novamente.' });
  }

  const dados = await resposta.json();
  const resultados = (dados.data || []).map((artigo) => ({
    title: artigo.title || '(sem titulo)',
    abstract: artigo.abstract || '',
    year: artigo.year || null,
    venue: artigo.venue || '',
    authors: (artigo.authors || []).map((autor) => autor.name).join(', '),
    doi: artigo.externalIds && artigo.externalIds.DOI ? artigo.externalIds.DOI : null,
    url: artigo.url || null,
    pdfAberto: artigo.openAccessPdf ? artigo.openAccessPdf.url : null,
  }));

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
    return res.status(400).json({ erro: 'Este resultado nao tem titulo, nao e possivel salvar.' });
  }

  const doiLimpo = doi ? String(doi).trim().toLowerCase() : null;
  const salvos = articles.listByUser(userId);

  let parecido = null;
  if (doiLimpo) {
    parecido = salvos.find((artigo) => artigo.doi && artigo.doi.toLowerCase() === doiLimpo);
  }
  if (!parecido) {
    parecido = salvos.find((artigo) => similaridadeTitulos(artigo.title, tituloLimpo) >= LIMIAR_SIMILARIDADE);
  }

  if (parecido && !forcar) {
    return res.status(409).json({
      duplicado: true,
      mensagem: `Ja existe um artigo parecido salvo: "${parecido.title}".`,
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
  const csv = gerarCsv(salvos);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="artigos-salvos.csv"');
  res.send(csv);
});

function campoCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  if (/[",\n]/.test(texto)) {
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  return texto;
}

function gerarCsv(listaArtigos) {
  const cabecalho = ['Titulo', 'Autores', 'Ano', 'Veiculo', 'DOI', 'Link', 'PDF de acesso aberto', 'Resumo'];
  const linhas = [cabecalho.join(',')];
  for (const artigo of listaArtigos) {
    linhas.push(
      [
        campoCsv(artigo.title),
        campoCsv(artigo.authors),
        campoCsv(artigo.year),
        campoCsv(artigo.venue),
        campoCsv(artigo.doi),
        campoCsv(artigo.url),
        campoCsv(artigo.pdf_url),
        campoCsv(artigo.abstract),
      ].join(',')
    );
  }
  // ﻿ (BOM) garante que o Excel abra os acentos corretamente.
  return '﻿' + linhas.join('\r\n');
}

module.exports = router;
