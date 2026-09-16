const express = require('express');
const { requireAuth } = require('../middleware/auth');
const articles = require('../db/articles');
const { similaridadeTitulos } = require('../utils/similaridade');

const router = express.Router();

const SEMANTIC_SCHOLAR_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CAMPOS_BUSCA = 'title,abstract,year,authors,venue,externalIds,url,openAccessPdf';
const LIMITE_RESULTADOS = 20;

// A partir desse grau de sobreposicao de palavras no titulo, avisamos que pode ser duplicata.
const LIMIAR_SIMILARIDADE = 0.6;

router.get('/artigos', requireAuth, (req, res) => {
  res.render('artigos', { queryInicial: req.query.q || '' });
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
