// Fórum: dropzone de anexos (multi-arquivo), clique no card do tópico, e o
// popup de perfil do autor (com pedido de amizade).

function escaparHtmlForum(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

// Dropzone de anexos: mesmo padrão visual/comportamento (arrastar-e-soltar)
// do upload de PDF em Leitura, generalizado pra múltiplos arquivos.
document.querySelectorAll('.dropzone-arquivo').forEach(function (dropzone) {
  const input = dropzone.querySelector('input[type="file"]');
  const textoSpan = dropzone.querySelector('span');
  if (!input || !textoSpan) return;

  function atualizarTexto() {
    const arquivos = input.files;
    if (!arquivos || arquivos.length === 0) {
      textoSpan.innerHTML = `<strong>${escaparHtmlForum(I18N_FORUM.chooseFiles)}</strong><small>${escaparHtmlForum(I18N_FORUM.dragHintFiles)}</small>`;
      return;
    }
    const nomes = Array.from(arquivos)
      .map((arquivo) => arquivo.name)
      .join(', ');
    const contagem = I18N_FORUM.filesSelectedCount.replace('{n}', arquivos.length);
    textoSpan.innerHTML = `<strong>${escaparHtmlForum(contagem)}</strong><small>${escaparHtmlForum(nomes)}</small>`;
  }

  input.addEventListener('change', atualizarTexto);

  ['dragover', 'dragenter'].forEach((evento) => {
    dropzone.addEventListener(evento, (e) => {
      e.preventDefault();
      dropzone.classList.add('arrastando');
    });
  });
  ['dragleave', 'dragend'].forEach((evento) => {
    dropzone.addEventListener(evento, () => dropzone.classList.remove('arrastando'));
  });
  dropzone.addEventListener('drop', (evento) => {
    evento.preventDefault();
    dropzone.classList.remove('arrastando');
    if (!evento.dataTransfer.files.length) return;
    input.files = evento.dataTransfer.files;
    input.dispatchEvent(new Event('change'));
  });
});

// Card do tópico inteiro é clicável, exceto quando o clique é no autor
// (que abre o popup de perfil) ou em outro link dentro do card.
document.querySelectorAll('.topico-forum-card[data-href]').forEach(function (card) {
  card.addEventListener('click', function (evento) {
    if (evento.target.closest('.autor-info') || evento.target.closest('a')) return;
    window.location.href = card.dataset.href;
  });
});

// Popup de perfil (avatar/nome clicável em qualquer autor-info da página).
const modalPerfil = document.getElementById('modal-perfil');

if (modalPerfil) {
  const modalPerfilFundo = document.getElementById('modal-perfil-fundo');
  const botaoPerfilFechar = document.getElementById('botao-perfil-fechar');
  const perfilStatus = document.getElementById('perfil-status');
  const perfilConteudo = document.getElementById('perfil-conteudo');
  const perfilAvatarImg = document.getElementById('perfil-avatar-img');
  const perfilAvatarVazio = document.getElementById('perfil-avatar-vazio');
  const perfilNome = document.getElementById('perfil-nome');
  const perfilLinhaArea = document.getElementById('perfil-linha-area');
  const perfilArea = document.getElementById('perfil-area');
  const perfilLinhaUniversidade = document.getElementById('perfil-linha-universidade');
  const perfilUniversidade = document.getElementById('perfil-universidade');
  const perfilLinhaFormacao = document.getElementById('perfil-linha-formacao');
  const perfilFormacao = document.getElementById('perfil-formacao');
  const perfilAcoes = document.getElementById('perfil-acoes');

  function abrirModalPerfil() {
    modalPerfil.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function fecharModalPerfil() {
    modalPerfil.style.display = 'none';
    document.body.style.overflow = '';
    perfilStatus.textContent = '';
    perfilStatus.classList.remove('erro-texto');
    perfilConteudo.style.display = 'none';
  }

  botaoPerfilFechar.addEventListener('click', fecharModalPerfil);
  modalPerfilFundo.addEventListener('click', fecharModalPerfil);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modalPerfil.style.display !== 'none') fecharModalPerfil();
  });

  function preencherLinha(container, elemento, valor) {
    if (valor) {
      elemento.textContent = valor;
      container.style.display = '';
    } else {
      container.style.display = 'none';
    }
  }

  function mostrarErroPerfil(mensagem) {
    perfilStatus.textContent = mensagem || I18N_FORUM.erroConexao;
    perfilStatus.classList.add('erro-texto');
  }

  function chamarApi(url, opcoes) {
    return fetch(url, opcoes)
      .then((resposta) => resposta.json().then((dados) => ({ ok: resposta.ok, dados })));
  }

  function solicitarAmizade(userId, botao) {
    botao.disabled = true;
    chamarApi('/network/solicitar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
      .then(({ ok, dados }) => {
        if (!ok) {
          mostrarErroPerfil(dados.erro);
          botao.disabled = false;
          return;
        }
        botao.textContent = I18N_FORUM.requestPendingButton;
        botao.className = 'botao secundario acao-larga';
      })
      .catch(() => {
        mostrarErroPerfil();
        botao.disabled = false;
      });
  }

  function responderSolicitacao(requestId, acao, perfil) {
    chamarApi(`/solicitacoes/${requestId}/${acao}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(({ ok, dados }) => {
        if (!ok) {
          mostrarErroPerfil(dados.erro);
          return;
        }
        perfil.status = dados.status;
        montarAcoesPerfil(perfil);
      })
      .catch(() => mostrarErroPerfil());
  }

  function montarAcoesPerfil(perfil) {
    perfilAcoes.innerHTML = '';
    if (perfil.status === 'self') return;

    if (perfil.status === 'none') {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'botao acao-larga';
      botao.textContent = I18N_FORUM.requestButton;
      botao.addEventListener('click', () => solicitarAmizade(perfil.id, botao));
      perfilAcoes.appendChild(botao);
    } else if (perfil.status === 'pending_sent') {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'botao secundario acao-larga';
      botao.textContent = I18N_FORUM.requestPendingButton;
      botao.disabled = true;
      perfilAcoes.appendChild(botao);
    } else if (perfil.status === 'pending_received') {
      const aceitar = document.createElement('button');
      aceitar.type = 'button';
      aceitar.className = 'botao';
      aceitar.textContent = I18N_FORUM.acceptButton;
      aceitar.addEventListener('click', () => responderSolicitacao(perfil.requestId, 'aceitar', perfil));

      const recusar = document.createElement('button');
      recusar.type = 'button';
      recusar.className = 'botao secundario';
      recusar.textContent = I18N_FORUM.rejectButton;
      recusar.addEventListener('click', () => responderSolicitacao(perfil.requestId, 'recusar', perfil));

      perfilAcoes.appendChild(aceitar);
      perfilAcoes.appendChild(recusar);
    } else if (perfil.status === 'friends') {
      const link = document.createElement('a');
      link.className = 'botao acao-larga';
      link.href = `/mensagens/${perfil.id}`;
      link.textContent = I18N_FORUM.sendMessageButton;
      perfilAcoes.appendChild(link);
    }
  }

  function preencherModalPerfil(perfil) {
    perfilNome.textContent = perfil.nome;
    if (perfil.temFoto) {
      perfilAvatarImg.src = `/usuarios/${perfil.id}/foto`;
      perfilAvatarImg.alt = perfil.nome;
      perfilAvatarImg.style.display = '';
      perfilAvatarVazio.style.display = 'none';
    } else {
      perfilAvatarImg.style.display = 'none';
      perfilAvatarVazio.style.display = '';
    }
    preencherLinha(perfilLinhaArea, perfilArea, perfil.area);
    preencherLinha(perfilLinhaUniversidade, perfilUniversidade, perfil.universidade);
    preencherLinha(perfilLinhaFormacao, perfilFormacao, perfil.formacaoAcademica);
    montarAcoesPerfil(perfil);
    perfilConteudo.style.display = '';
  }

  document.querySelectorAll('[data-abrir-perfil]').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation();
      const userId = botao.getAttribute('data-abrir-perfil');

      abrirModalPerfil();
      perfilStatus.textContent = '';
      perfilStatus.classList.remove('erro-texto');
      perfilConteudo.style.display = 'none';

      chamarApi(`/usuarios/${userId}/perfil`, {})
        .then(({ ok, dados }) => {
          if (!ok) {
            mostrarErroPerfil(dados.erro);
            return;
          }
          preencherModalPerfil(dados);
        })
        .catch(() => mostrarErroPerfil());
    });
  });
}
