const crypto = require('node:crypto');
const db = require('./index');

const TIPOS_VALIDOS = ['curta', 'paragrafo', 'unica', 'multipla'];
const TIPOS_COM_OPCOES = ['unica', 'multipla'];

function gerarTokenUnico() {
  let token;
  do {
    token = crypto.randomBytes(6).toString('base64url');
  } while (db.prepare('SELECT 1 FROM forms WHERE public_token = ?').get(token));
  return token;
}

function listByUser(userId) {
  return db
    .prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM form_responses r WHERE r.form_id = f.id) AS totalRespostas
       FROM forms f
       WHERE f.user_id = ?
       ORDER BY datetime(f.created_at) DESC`
    )
    .all(userId);
}

function findById(id) {
  return db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
}

function findByToken(token) {
  return db.prepare('SELECT * FROM forms WHERE public_token = ?').get(token);
}

function getQuestions(formId) {
  const perguntas = db
    .prepare('SELECT * FROM form_questions WHERE form_id = ? ORDER BY position ASC')
    .all(formId);
  const opcoesPorPergunta = new Map();
  db.prepare(
    `SELECT o.* FROM form_question_options o
     JOIN form_questions q ON q.id = o.question_id
     WHERE q.form_id = ?
     ORDER BY o.position ASC`
  )
    .all(formId)
    .forEach((opcao) => {
      if (!opcoesPorPergunta.has(opcao.question_id)) opcoesPorPergunta.set(opcao.question_id, []);
      opcoesPorPergunta.get(opcao.question_id).push(opcao);
    });

  return perguntas.map((pergunta) => ({
    ...pergunta,
    options: opcoesPorPergunta.get(pergunta.id) || [],
  }));
}

function inserirPerguntas(formId, perguntas) {
  perguntas.forEach((pergunta, indice) => {
    const tipo = TIPOS_VALIDOS.includes(pergunta.type) ? pergunta.type : 'curta';
    const texto = (pergunta.text || '').trim();
    if (!texto) return;

    const resultado = db
      .prepare('INSERT INTO form_questions (form_id, position, type, text) VALUES (?, ?, ?, ?)')
      .run(formId, indice, tipo, texto);

    if (TIPOS_COM_OPCOES.includes(tipo)) {
      const opcoes = Array.isArray(pergunta.options) ? pergunta.options : [];
      opcoes.forEach((opcaoTexto, indiceOpcao) => {
        const textoOpcao = (opcaoTexto || '').trim();
        if (!textoOpcao) return;
        db.prepare('INSERT INTO form_question_options (question_id, position, text) VALUES (?, ?, ?)').run(
          resultado.lastInsertRowid,
          indiceOpcao,
          textoOpcao
        );
      });
    }
  });
}

function create({ userId, title, description, questions }) {
  const token = gerarTokenUnico();
  const resultado = db
    .prepare('INSERT INTO forms (user_id, title, description, public_token) VALUES (?, ?, ?, ?)')
    .run(userId, title, description || '', token);
  inserirPerguntas(resultado.lastInsertRowid, questions || []);
  return findById(resultado.lastInsertRowid);
}

// So mexe nas perguntas se o formulario ainda nao tiver nenhuma resposta -
// depois disso, mudar perguntas deixaria respostas antigas "orfas" (sem
// pergunta correspondente), entao a checagem de countResponses() > 0 e
// feita na rota antes de chamar isso.
function updateComPerguntas(id, userId, { title, description, questions }) {
  const formulario = db.prepare('SELECT id FROM forms WHERE id = ? AND user_id = ?').get(id, userId);
  if (!formulario) return null;

  db.prepare('UPDATE forms SET title = ?, description = ? WHERE id = ?').run(title, description || '', id);

  db.prepare(
    `DELETE FROM form_question_options WHERE question_id IN (SELECT id FROM form_questions WHERE form_id = ?)`
  ).run(id);
  db.prepare('DELETE FROM form_questions WHERE form_id = ?').run(id);
  inserirPerguntas(id, questions || []);

  return findById(id);
}

function updateDetalhes(id, userId, { title, description }) {
  db.prepare('UPDATE forms SET title = ?, description = ? WHERE id = ? AND user_id = ?').run(
    title,
    description || '',
    id,
    userId
  );
  return findById(id);
}

function setStatus(id, userId, status) {
  db.prepare('UPDATE forms SET status = ? WHERE id = ? AND user_id = ?').run(status, id, userId);
}

function countResponses(formId) {
  return db.prepare('SELECT COUNT(*) AS total FROM form_responses WHERE form_id = ?').get(formId).total;
}

function recordResponse(formId, respostasPorPergunta, respondente) {
  const resultado = db
    .prepare('INSERT INTO form_responses (form_id, respondent_name, respondent_study_area) VALUES (?, ?, ?)')
    .run(formId, respondente.name, respondente.studyArea || null);
  const responseId = resultado.lastInsertRowid;

  for (const resposta of respostasPorPergunta) {
    if (Array.isArray(resposta.optionIds) && resposta.optionIds.length > 0) {
      resposta.optionIds.forEach((optionId) => {
        db.prepare(
          'INSERT INTO form_response_answers (response_id, question_id, option_id) VALUES (?, ?, ?)'
        ).run(responseId, resposta.questionId, optionId);
      });
    } else if (resposta.text && resposta.text.trim()) {
      db.prepare(
        'INSERT INTO form_response_answers (response_id, question_id, answer_text) VALUES (?, ?, ?)'
      ).run(responseId, resposta.questionId, resposta.text.trim());
    }
  }

  return responseId;
}

// Uma linha por resposta enviada, com um mapa questionId -> texto (pra
// perguntas de escolha, junta os textos das opcoes marcadas com ", ").
function listResponses(formId) {
  const respostas = db
    .prepare('SELECT * FROM form_responses WHERE form_id = ? ORDER BY datetime(created_at) ASC')
    .all(formId);

  const respostasDetalhadas = db
    .prepare(
      `SELECT a.response_id AS responseId, a.question_id AS questionId, a.answer_text AS answerText, o.text AS optionText
       FROM form_response_answers a
       LEFT JOIN form_question_options o ON o.id = a.option_id
       WHERE a.response_id IN (SELECT id FROM form_responses WHERE form_id = ?)`
    )
    .all(formId);

  const porResposta = new Map();
  respostasDetalhadas.forEach((linha) => {
    if (!porResposta.has(linha.responseId)) porResposta.set(linha.responseId, new Map());
    const porPergunta = porResposta.get(linha.responseId);
    const valor = linha.optionText || linha.answerText || '';
    if (!porPergunta.has(linha.questionId)) porPergunta.set(linha.questionId, []);
    porPergunta.get(linha.questionId).push(valor);
  });

  return respostas.map((resposta) => ({
    ...resposta,
    respostasPorPergunta: porResposta.get(resposta.id) || new Map(),
  }));
}

// Contagem de marcacoes por opcao, pra montar o grafico de barras de cada
// pergunta de escolha unica/multipla.
function getOptionCounts(formId) {
  const linhas = db
    .prepare(
      `SELECT a.question_id AS questionId, a.option_id AS optionId, COUNT(*) AS total
       FROM form_response_answers a
       JOIN form_questions q ON q.id = a.question_id
       WHERE q.form_id = ? AND a.option_id IS NOT NULL
       GROUP BY a.question_id, a.option_id`
    )
    .all(formId);

  const porPergunta = new Map();
  linhas.forEach((linha) => {
    if (!porPergunta.has(linha.questionId)) porPergunta.set(linha.questionId, new Map());
    porPergunta.get(linha.questionId).set(linha.optionId, linha.total);
  });
  return porPergunta;
}

// Dono (user_id) e pergunta de uma resposta individual - usado pra checar
// permissao antes de aplicar/remover um codigo nela.
function findAnswerOwnership(answerId) {
  return db
    .prepare(
      `SELECT a.id, a.question_id AS questionId, q.form_id AS formId, f.user_id AS userId
       FROM form_response_answers a
       JOIN form_questions q ON q.id = a.question_id
       JOIN forms f ON f.id = q.form_id
       WHERE a.id = ?`
    )
    .get(answerId);
}

// Respostas de texto (curta/paragrafo) de uma unica pergunta, com o id de
// cada resposta individual - usado pra poder aplicar codigos nela.
function listTextAnswersByQuestion(questionId) {
  return db
    .prepare(
      `SELECT a.id, a.answer_text AS text, a.response_id AS responseId, r.created_at AS respondedAt,
              r.respondent_name AS respondentName, r.respondent_study_area AS respondentStudyArea
       FROM form_response_answers a
       JOIN form_responses r ON r.id = a.response_id
       WHERE a.question_id = ? AND a.answer_text IS NOT NULL AND TRIM(a.answer_text) != ''
       ORDER BY datetime(r.created_at) ASC`
    )
    .all(questionId);
}

module.exports = {
  TIPOS_VALIDOS,
  TIPOS_COM_OPCOES,
  listByUser,
  findById,
  findByToken,
  getQuestions,
  create,
  updateComPerguntas,
  updateDetalhes,
  setStatus,
  countResponses,
  recordResponse,
  listResponses,
  getOptionCounts,
  listTextAnswersByQuestion,
  findAnswerOwnership,
};
