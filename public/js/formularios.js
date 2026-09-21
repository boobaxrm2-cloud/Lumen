// Construtor de formularios: adicionar/remover pergunta e opcao
// dinamicamente, e serializar tudo em JSON antes do envio (mais simples de
// ler no servidor do que parsear inputs com colchetes).

function escaparAtributoFormulario(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}

const TIPOS_COM_OPCOES_JS = ['unica', 'multipla'];

function criarLinhaOpcaoFormulario(texto) {
  const linha = document.createElement('div');
  linha.className = 'opcao-construtor';
  linha.innerHTML = `
    <input type="text" class="opcao-texto" placeholder="${escaparAtributoFormulario(I18N_FORMS.optionPlaceholder)}" value="${escaparAtributoFormulario(texto)}" />
    <button type="button" class="remover-opcao" title="${escaparAtributoFormulario(I18N_FORMS.removeOptionTitle)}">
      <svg class="icone" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  return linha;
}

function alternarVisibilidadeOpcoes(bloco) {
  const tipo = bloco.querySelector('.pergunta-tipo').value;
  const painel = bloco.querySelector('.pergunta-construtor-opcoes');
  const mostrar = TIPOS_COM_OPCOES_JS.includes(tipo);
  painel.style.display = mostrar ? '' : 'none';

  const listaOpcoes = bloco.querySelector('.lista-opcoes-construtor');
  if (mostrar && listaOpcoes.children.length === 0) {
    listaOpcoes.appendChild(criarLinhaOpcaoFormulario(''));
    listaOpcoes.appendChild(criarLinhaOpcaoFormulario(''));
  }
}

function criarBlocoPerguntaFormulario() {
  const bloco = document.createElement('div');
  bloco.className = 'pergunta-construtor';
  bloco.innerHTML = `
    <div class="pergunta-construtor-topo">
      <input type="text" class="pergunta-texto" placeholder="${escaparAtributoFormulario(I18N_FORMS.questionPlaceholder)}" />
      <select class="pergunta-tipo">
        <option value="curta">${escaparAtributoFormulario(I18N_FORMS.typeShort)}</option>
        <option value="paragrafo">${escaparAtributoFormulario(I18N_FORMS.typeParagraph)}</option>
        <option value="unica">${escaparAtributoFormulario(I18N_FORMS.typeSingle)}</option>
        <option value="multipla">${escaparAtributoFormulario(I18N_FORMS.typeMultiple)}</option>
      </select>
      <button type="button" class="botao-icone remover-pergunta" title="${escaparAtributoFormulario(I18N_FORMS.removeQuestionTitle)}">
        <svg class="icone" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="pergunta-construtor-opcoes" style="display: none;">
      <div class="lista-opcoes-construtor"></div>
      <button type="button" class="botao secundario adicionar-opcao">
        <svg class="icone" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        ${escaparAtributoFormulario(I18N_FORMS.addOptionButton)}
      </button>
    </div>
  `;
  return bloco;
}

document.addEventListener('DOMContentLoaded', function () {
  const containerPerguntas = document.getElementById('perguntas-construtor');
  const botaoAdicionarPergunta = document.getElementById('botao-adicionar-pergunta');
  const formulario = document.getElementById('form-construtor-formulario');
  const campoPerguntasJson = document.getElementById('campo-perguntas-json');
  if (!containerPerguntas || !formulario) return;

  botaoAdicionarPergunta.addEventListener('click', function () {
    containerPerguntas.appendChild(criarBlocoPerguntaFormulario());
  });

  containerPerguntas.addEventListener('click', function (evento) {
    const botaoRemoverPergunta = evento.target.closest('.remover-pergunta');
    if (botaoRemoverPergunta) {
      botaoRemoverPergunta.closest('.pergunta-construtor').remove();
      return;
    }
    const botaoRemoverOpcao = evento.target.closest('.remover-opcao');
    if (botaoRemoverOpcao) {
      botaoRemoverOpcao.closest('.opcao-construtor').remove();
      return;
    }
    const botaoAdicionarOpcao = evento.target.closest('.adicionar-opcao');
    if (botaoAdicionarOpcao) {
      const listaOpcoes = botaoAdicionarOpcao.closest('.pergunta-construtor-opcoes').querySelector('.lista-opcoes-construtor');
      listaOpcoes.appendChild(criarLinhaOpcaoFormulario(''));
    }
  });

  containerPerguntas.addEventListener('change', function (evento) {
    if (evento.target.classList.contains('pergunta-tipo')) {
      alternarVisibilidadeOpcoes(evento.target.closest('.pergunta-construtor'));
    }
  });

  formulario.addEventListener('submit', function () {
    const perguntas = Array.from(containerPerguntas.querySelectorAll('.pergunta-construtor')).map(function (bloco) {
      const tipo = bloco.querySelector('.pergunta-tipo').value;
      const texto = bloco.querySelector('.pergunta-texto').value.trim();
      const opcoes = TIPOS_COM_OPCOES_JS.includes(tipo)
        ? Array.from(bloco.querySelectorAll('.opcao-texto')).map((input) => input.value.trim()).filter(Boolean)
        : [];
      return { type: tipo, text: texto, options: opcoes };
    }).filter((pergunta) => pergunta.text);

    campoPerguntasJson.value = JSON.stringify(perguntas);
  });
});
