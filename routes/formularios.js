const express = require('express');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');
const forms = require('../db/forms');
const formCodes = require('../db/form-codes');
const formAnswerCodes = require('../db/form-answer-codes');
const { t, LOCALE_POR_IDIOMA, CSV_DELIMITADOR_POR_IDIOMA } = require('../utils/i18n');
const { CORES_CODIGO } = require('../utils/cores-codigo');

const router = express.Router();

function linkPublico(req, token) {
  return `${req.protocol}://${req.get('host')}/f/${token}`;
}

// Resumo geral das perguntas de escolha unica/multipla: soma quantas vezes
// cada TEXTO de opcao foi escolhido em todas as perguntas de escolha do
// formulario (opcoes com o mesmo texto em perguntas diferentes, tipo uma
// escala repetida, se juntam numa barra so), com a porcentagem calculada
// sobre esse total geral - em vez de fragmentar pergunta por pergunta.
function calcularResumoGeralOpcoes(perguntas, contagensPorPergunta) {
  const contagensPorTexto = new Map();
  perguntas.forEach((pergunta) => {
    if (!forms.TIPOS_COM_OPCOES.includes(pergunta.type)) return;
    const contagens = contagensPorPergunta.get(pergunta.id) || new Map();
    pergunta.options.forEach((opcao) => {
      const n = contagens.get(opcao.id) || 0;
      contagensPorTexto.set(opcao.text, (contagensPorTexto.get(opcao.text) || 0) + n);
    });
  });

  const totalGeral = Array.from(contagensPorTexto.values()).reduce((soma, n) => soma + n, 0);
  const resumo = Array.from(contagensPorTexto.entries())
    .map(([text, total]) => ({ text, total, percentual: totalGeral > 0 ? Math.round((total / totalGeral) * 100) : 0 }))
    .filter((opcao) => opcao.total > 0);

  return { resumo, totalGeral };
}

// Le o campo oculto "perguntasJson" (preenchido pelo JS do construtor) e
// devolve uma lista de perguntas valida - qualquer coisa mal formada ou
// vazia e ignorada, em vez de derrubar a rota com uma excecao.
function parsearPerguntas(perguntasJson) {
  try {
    const bruto = JSON.parse(perguntasJson || '[]');
    if (!Array.isArray(bruto)) return [];
    return bruto
      .map((p) => ({
        type: forms.TIPOS_VALIDOS.includes(p.type) ? p.type : 'curta',
        text: String(p.text || '').trim(),
        options: Array.isArray(p.options) ? p.options.map((o) => String(o || '').trim()).filter(Boolean) : [],
      }))
      .filter((p) => p.text);
  } catch (erro) {
    return [];
  }
}

router.get('/formularios', requireAuth, (req, res) => {
  const meusFormularios = forms.listByUser(req.session.userId);
  res.render('formularios', { meusFormularios });
});

router.get('/formularios/novo', requireAuth, (req, res) => {
  res.render('formulario-construtor', { formulario: null, perguntas: [] });
});

router.post('/formularios', requireAuth, (req, res) => {
  const titulo = (req.body.title || '').trim();
  if (!titulo) return res.redirect('/formularios/novo');

  const perguntas = parsearPerguntas(req.body.perguntasJson);
  const formulario = forms.create({
    userId: req.session.userId,
    title: titulo,
    description: (req.body.description || '').trim(),
    questions: perguntas,
  });
  res.redirect(`/formularios/${formulario.id}`);
});

function encontrarFormularioDoUsuario(req) {
  const formulario = forms.findById(req.params.id);
  if (!formulario || formulario.user_id !== req.session.userId) return null;
  return formulario;
}

router.get('/formularios/:id/editar', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  if (forms.countResponses(formulario.id) > 0) {
    return res.redirect(`/formularios/${formulario.id}`);
  }

  const perguntas = forms.getQuestions(formulario.id);
  res.render('formulario-construtor', { formulario, perguntas });
});

router.post('/formularios/:id', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const titulo = (req.body.title || '').trim();
  if (!titulo) return res.redirect(`/formularios/${formulario.id}/editar`);

  if (forms.countResponses(formulario.id) > 0) {
    forms.updateDetalhes(formulario.id, req.session.userId, {
      title: titulo,
      description: (req.body.description || '').trim(),
    });
  } else {
    const perguntas = parsearPerguntas(req.body.perguntasJson);
    forms.updateComPerguntas(formulario.id, req.session.userId, {
      title: titulo,
      description: (req.body.description || '').trim(),
      questions: perguntas,
    });
  }

  res.redirect(`/formularios/${formulario.id}`);
});

router.get('/formularios/:id', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const perguntas = forms.getQuestions(formulario.id);
  const respostas = forms.listResponses(formulario.id);
  const contagensPorPergunta = forms.getOptionCounts(formulario.id);

  const paresCodigoResposta = formAnswerCodes.listCodesForForm(formulario.id);
  const codigosPorResposta = new Map();
  paresCodigoResposta.forEach((par) => {
    if (!codigosPorResposta.has(par.answerId)) codigosPorResposta.set(par.answerId, []);
    codigosPorResposta.get(par.answerId).push({ id: par.id, name: par.name, color: par.color });
  });

  // Codigos sao do formulario inteiro (nao de uma pergunta so) - criados uma
  // vez e reaproveitados em qualquer pergunta de texto livre desse formulario.
  const codigosDoFormulario = formCodes.listByForm(formulario.id, req.session.userId);
  const temPerguntaDeTexto = perguntas.some((p) => !forms.TIPOS_COM_OPCOES.includes(p.type));
  const temPerguntaDeEscolha = perguntas.some((p) => forms.TIPOS_COM_OPCOES.includes(p.type));

  const { resumo: resumoGeralOpcoes, totalGeral: totalGeralOpcoes } = calcularResumoGeralOpcoes(
    perguntas,
    contagensPorPergunta
  );

  // Dashboard geral: soma o uso de cada codigo em TODAS as perguntas do
  // formulario, com a porcentagem calculada sobre esse total geral - da uma
  // visao unica do formulario todo, em vez de fragmentar pergunta por pergunta.
  const contagensGerais = formCodes.countUsageAcrossForm(formulario.id);
  const totalGeralCodificado = Array.from(contagensGerais.values()).reduce((soma, n) => soma + n, 0);
  const resumoGeralCodigos = codigosDoFormulario
    .map((codigo) => {
      const n = contagensGerais.get(codigo.id) || 0;
      return { ...codigo, total: n, percentual: totalGeralCodificado > 0 ? Math.round((n / totalGeralCodificado) * 100) : 0 };
    })
    .filter((codigo) => codigo.total > 0);

  const perguntasComGrafico = perguntas.map((pergunta) => {
    if (forms.TIPOS_COM_OPCOES.includes(pergunta.type)) {
      const contagens = contagensPorPergunta.get(pergunta.id) || new Map();
      const total = Array.from(contagens.values()).reduce((soma, n) => soma + n, 0);
      const opcoesComContagem = pergunta.options.map((opcao) => {
        const n = contagens.get(opcao.id) || 0;
        return { ...opcao, total: n, percentual: total > 0 ? Math.round((n / total) * 100) : 0 };
      });
      return { ...pergunta, optionsComContagem: opcoesComContagem, totalRespostasPergunta: total };
    }

    // Pergunta de texto livre: usa a lista de codigos do formulario, so com
    // a contagem de uso recalculada pra essa pergunta especifica.
    const contagensCodigo = formCodes.countUsageByQuestion(pergunta.id);
    const totalCodificado = Array.from(contagensCodigo.values()).reduce((soma, n) => soma + n, 0);
    const codigosComContagem = codigosDoFormulario.map((codigo) => {
      const n = contagensCodigo.get(codigo.id) || 0;
      return { ...codigo, total: n, percentual: totalCodificado > 0 ? Math.round((n / totalCodificado) * 100) : 0 };
    });
    const textAnswers = forms.listTextAnswersByQuestion(pergunta.id).map((resposta) => ({
      ...resposta,
      codigos: codigosPorResposta.get(resposta.id) || [],
    }));

    return { ...pergunta, codigos: codigosComContagem, totalCodificado, textAnswers };
  });

  res.render('formulario-dashboard', {
    formulario,
    codigosDoFormulario,
    resumoGeralCodigos,
    totalGeralCodificado,
    temPerguntaDeTexto,
    resumoGeralOpcoes,
    totalGeralOpcoes,
    temPerguntaDeEscolha,
    perguntas: perguntasComGrafico,
    respostas,
    totalRespostas: respostas.length,
    linkPublico: linkPublico(req, formulario.public_token),
    coresCodigo: CORES_CODIGO,
  });
});

router.post('/formularios/:id/codigos', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const nome = (req.body.name || '').trim();
  const cor = CORES_CODIGO.includes(req.body.color) ? req.body.color : CORES_CODIGO[0];
  if (nome) {
    formCodes.create({ userId: req.session.userId, formId: formulario.id, name: nome, color: cor });
  }
  res.redirect(`/formularios/${formulario.id}#secao-codigos`);
});

router.post('/formularios/:id/codigos/:codeId/remover', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  formCodes.remove(req.params.codeId, req.session.userId);
  res.redirect(`/formularios/${formulario.id}`);
});

router.post('/formularios/:id/respostas/:answerId/alternar-codigo', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const codeId = Number.parseInt(req.body.codeId, 10);
  const codigo = formCodes.findById(codeId);
  const respostaAnswer = forms.findAnswerOwnership(req.params.answerId);

  if (
    respostaAnswer &&
    respostaAnswer.userId === req.session.userId &&
    codigo &&
    codigo.form_id === respostaAnswer.formId
  ) {
    formAnswerCodes.toggle(req.params.answerId, codeId);
  }

  const questionId = req.body.voltarParaPergunta || (respostaAnswer ? respostaAnswer.questionId : '');
  res.redirect(`/formularios/${formulario.id}${questionId ? '#pergunta-' + questionId : ''}`);
});

router.post('/formularios/:id/encerrar', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (formulario) forms.setStatus(formulario.id, req.session.userId, 'encerrado');
  res.redirect(`/formularios/${req.params.id}`);
});

router.post('/formularios/:id/reabrir', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (formulario) forms.setStatus(formulario.id, req.session.userId, 'aberto');
  res.redirect(`/formularios/${req.params.id}`);
});

router.get('/formularios/:id/qrcode.png', requireAuth, async (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).end();

  res.setHeader('Content-Type', 'image/png');
  const buffer = await QRCode.toBuffer(linkPublico(req, formulario.public_token), { width: 320, margin: 1 });
  res.send(buffer);
});

function campoCsv(valor, delimitador) {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  const precisaAspas = new RegExp(`["${delimitador}\r\n]`).test(texto);
  if (precisaAspas) return '"' + texto.replace(/"/g, '""') + '"';
  return texto;
}

function gerarCsvRespostas(perguntas, respostas, lang) {
  const delimitador = CSV_DELIMITADOR_POR_IDIOMA[lang];
  const cabecalho = [
    t(lang, 'forms.csv.sentAt'),
    t(lang, 'forms.csv.respondent'),
    t(lang, 'forms.csv.studyArea'),
    ...perguntas.map((p) => p.text),
  ];
  const linhas = [cabecalho.map((c) => campoCsv(c, delimitador)).join(delimitador)];

  respostas.forEach((resposta) => {
    const linha = [
      resposta.created_at,
      resposta.respondent_name,
      resposta.respondent_study_area || '',
      ...perguntas.map((p) => (resposta.respostasPorPergunta.get(p.id) || []).join(', ')),
    ];
    linhas.push(linha.map((c) => campoCsv(c, delimitador)).join(delimitador));
  });

  return '﻿' + linhas.join('\r\n');
}

router.get('/formularios/:id/exportar.csv', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const perguntas = forms.getQuestions(formulario.id);
  const respostas = forms.listResponses(formulario.id);
  const csv = gerarCsvRespostas(perguntas, respostas, res.locals.lang);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="respostas.csv"');
  res.send(csv);
});

function nomeArquivoSeguro(titulo) {
  return (titulo || 'formulario').replace(/[^\w.-]+/g, '_').slice(0, 100);
}

function desenharGraficoBarrasPdf(doc, opcoes) {
  const maiorContagem = Math.max(...opcoes.map((o) => o.total), 1);
  const larguraTotal = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const larguraLabel = 180;
  const larguraContagem = 70;
  const larguraBarraMax = larguraTotal - larguraLabel - larguraContagem;
  const alturaBarra = 14;
  const espacamento = 8;

  opcoes.forEach((opcao) => {
    const y = doc.y;
    const larguraBarra = Math.max(3, (opcao.total / maiorContagem) * larguraBarraMax);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333')
      .text(opcao.text, doc.page.margins.left, y + 2, { width: larguraLabel - 8, ellipsis: true });

    doc.rect(doc.page.margins.left + larguraLabel, y, larguraBarra, alturaBarra).fill('#f0c14b');

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#333')
      .text(`${opcao.total} (${opcao.percentual}%)`, doc.page.margins.left + larguraLabel + larguraBarra + 6, y + 2);

    doc.y = y + alturaBarra + espacamento;
  });
  doc.x = doc.page.margins.left;
}

router.get('/formularios/:id/dashboard.pdf', requireAuth, (req, res) => {
  const formulario = encontrarFormularioDoUsuario(req);
  if (!formulario) return res.status(404).send(res.locals.t('forms.erroNaoEncontrado'));

  const lang = res.locals.lang;
  const perguntas = forms.getQuestions(formulario.id);
  const respostas = forms.listResponses(formulario.id);
  const contagensPorPergunta = forms.getOptionCounts(formulario.id);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="dashboard-${nomeArquivoSeguro(formulario.title)}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1a1f2e').text(formulario.title);
  if (formulario.description) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fillColor('#444').text(formulario.description);
  }
  doc.moveDown(0.3);
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#666')
    .text(t(lang, 'forms.pdf.exportedAt', { data: new Date().toLocaleDateString(LOCALE_POR_IDIOMA[lang]) }));
  doc.text(t(lang, 'forms.pdf.totalResponses', { n: respostas.length }));
  doc.moveDown(1);

  // Resumo geral: soma o uso de cada codigo em TODAS as perguntas de texto do
  // formulario, com a porcentagem sobre esse total geral - um dashboard unico
  // do formulario, em vez de fragmentado pergunta por pergunta.
  const contagensGerais = formCodes.countUsageAcrossForm(formulario.id);
  const totalGeralCodificado = Array.from(contagensGerais.values()).reduce((soma, n) => soma + n, 0);
  if (totalGeralCodificado > 0) {
    const resumoGeralCodigos = formCodes
      .listByForm(formulario.id, req.session.userId)
      .map((codigo) => {
        const n = contagensGerais.get(codigo.id) || 0;
        return { text: codigo.name, total: n, percentual: Math.round((n / totalGeralCodificado) * 100) };
      })
      .filter((codigo) => codigo.total > 0);

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1f2e').text(t(lang, 'forms.coding.overallHeading'));
    doc.moveDown(0.5);
    desenharGraficoBarrasPdf(doc, resumoGeralCodigos);
    doc.moveDown(1);
  }

  const { resumo: resumoGeralOpcoes, totalGeral: totalGeralOpcoes } = calcularResumoGeralOpcoes(
    perguntas,
    contagensPorPergunta
  );
  if (totalGeralOpcoes > 0) {
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a1f2e').text(t(lang, 'forms.optionsSummary.heading'));
    doc.moveDown(0.5);
    desenharGraficoBarrasPdf(doc, resumoGeralOpcoes);
    doc.moveDown(1);
  }

  perguntas.forEach((pergunta) => {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1f2e').text(pergunta.text);
    doc.moveDown(0.4);

    if (forms.TIPOS_COM_OPCOES.includes(pergunta.type)) {
      const contagens = contagensPorPergunta.get(pergunta.id) || new Map();
      const total = Array.from(contagens.values()).reduce((soma, n) => soma + n, 0);
      const opcoesComContagem = pergunta.options.map((opcao) => {
        const n = contagens.get(opcao.id) || 0;
        return { text: opcao.text, total: n, percentual: total > 0 ? Math.round((n / total) * 100) : 0 };
      });
      if (total === 0) {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666').text(t(lang, 'forms.pdf.noAnswersYet'));
      } else {
        desenharGraficoBarrasPdf(doc, opcoesComContagem);
      }
    } else {
      const contagensCodigo = formCodes.countUsageByQuestion(pergunta.id);
      const totalCodificado = Array.from(contagensCodigo.values()).reduce((soma, n) => soma + n, 0);

      if (totalCodificado > 0) {
        const codigos = formCodes
          .listByForm(formulario.id, req.session.userId)
          .map((codigo) => {
            const n = contagensCodigo.get(codigo.id) || 0;
            return { text: codigo.name, total: n, percentual: Math.round((n / totalCodificado) * 100) };
          })
          .filter((codigo) => codigo.total > 0);
        desenharGraficoBarrasPdf(doc, codigos);
      } else {
        const textos = respostas
          .map((r) => {
            const texto = (r.respostasPorPergunta.get(pergunta.id) || []).join(', ');
            return texto ? { nome: r.respondent_name, texto } : null;
          })
          .filter(Boolean);
        if (textos.length === 0) {
          doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666').text(t(lang, 'forms.pdf.noAnswersYet'));
        } else {
          textos.forEach((item, indice) => {
            doc
              .font('Helvetica-Bold')
              .fontSize(10)
              .fillColor('#333')
              .text(`${indice + 1}. ${item.nome}: `, { continued: true })
              .font('Helvetica')
              .text(item.texto);
          });
        }
      }
    }
    doc.moveDown(1);
  });

  doc.end();
});

// ---- Rotas publicas (sem login) ----

router.get('/f/:token', (req, res) => {
  const formulario = forms.findByToken(req.params.token);
  if (!formulario) return res.status(404).render('formulario-publico', { formulario: null, perguntas: [] });

  const perguntas = forms.getQuestions(formulario.id);
  res.render('formulario-publico', {
    formulario,
    perguntas,
    erro: null,
    valores: { respondentName: '', respondentStudyArea: '' },
  });
});

router.post('/f/:token', (req, res) => {
  const formulario = forms.findByToken(req.params.token);
  if (!formulario) return res.status(404).render('formulario-publico', { formulario: null, perguntas: [] });

  const perguntas = forms.getQuestions(formulario.id);

  if (formulario.status === 'encerrado') {
    return res.render('formulario-publico', { formulario, perguntas, erro: null, valores: {} });
  }

  const nomeRespondente = (req.body.respondentName || '').trim();
  const areaRespondente = (req.body.respondentStudyArea || '').trim();
  if (!nomeRespondente) {
    return res.render('formulario-publico', {
      formulario,
      perguntas,
      erro: res.locals.t('forms.public.erroNomeObrigatorio'),
      valores: { respondentName: nomeRespondente, respondentStudyArea: areaRespondente },
    });
  }

  const respostasPorPergunta = perguntas.map((pergunta) => {
    const bruto = req.body[`pergunta_${pergunta.id}`];
    if (forms.TIPOS_COM_OPCOES.includes(pergunta.type)) {
      const optionIds = (Array.isArray(bruto) ? bruto : bruto ? [bruto] : []).map((v) => Number.parseInt(v, 10));
      return { questionId: pergunta.id, optionIds };
    }
    return { questionId: pergunta.id, text: typeof bruto === 'string' ? bruto : '' };
  });

  forms.recordResponse(formulario.id, respostasPorPergunta, { name: nomeRespondente, studyArea: areaRespondente });
  res.render('formulario-obrigado', { formulario });
});

module.exports = router;
