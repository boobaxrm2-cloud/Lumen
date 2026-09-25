// Modal de "adicionar nova conexao", em 2 etapas: email -> confirmar Sim/Nao.
// Mesmo esqueleto do modal de compartilhar biblioteca em public/js/biblioteca.js.

const botaoAbrirAdicionarConexao = document.getElementById('botao-adicionar-conexao');

if (botaoAbrirAdicionarConexao) {
  const I18N_NETWORK_TXT = window.I18N_NETWORK;

  const modal = document.getElementById('modal-adicionar-conexao');
  const modalFundo = document.getElementById('modal-adicionar-conexao-fundo');
  const status = document.getElementById('adicionar-conexao-status');

  const etapaEmail = document.getElementById('adicionar-conexao-etapa-email');
  const etapaConfirmar = document.getElementById('adicionar-conexao-etapa-confirmar');

  const campoEmail = document.getElementById('adicionar-conexao-email');
  const textoConfirmar = document.getElementById('adicionar-conexao-confirmar-texto');

  let emailAtual = '';

  function preencher(modelo, valores) {
    return modelo.replace(/\{(\w+)\}/g, (_, nome) => valores[nome]);
  }

  function abrirModal() {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function fecharModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    status.textContent = '';
    status.classList.remove('erro-texto');
    emailAtual = '';
    campoEmail.value = '';
    etapaEmail.style.display = '';
    etapaConfirmar.style.display = 'none';
  }

  function mostrarErro(mensagem) {
    status.textContent = mensagem;
    status.classList.add('erro-texto');
  }

  botaoAbrirAdicionarConexao.addEventListener('click', abrirModal);
  document.getElementById('botao-adicionar-conexao-cancelar').addEventListener('click', fecharModal);
  document.getElementById('botao-adicionar-conexao-nao').addEventListener('click', fecharModal);
  modalFundo.addEventListener('click', fecharModal);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modal.style.display !== 'none') fecharModal();
  });

  document.getElementById('botao-adicionar-conexao-continuar').addEventListener('click', async () => {
    const email = campoEmail.value.trim();
    if (!email) return;

    status.textContent = '';
    status.classList.remove('erro-texto');

    try {
      const resposta = await fetch('/api/network/adicionar/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarErro(dados.erro || I18N_NETWORK_TXT.erroConexao);
        return;
      }

      emailAtual = email;
      textoConfirmar.textContent = preencher(I18N_NETWORK_TXT.confirmarTexto, {
        nome: dados.nome,
        email: dados.email,
      });
      etapaEmail.style.display = 'none';
      etapaConfirmar.style.display = '';
    } catch (erro) {
      mostrarErro(I18N_NETWORK_TXT.erroConexao);
    }
  });

  document.getElementById('botao-adicionar-conexao-sim').addEventListener('click', async () => {
    status.textContent = '';
    status.classList.remove('erro-texto');

    try {
      const resposta = await fetch('/api/network/adicionar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAtual }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarErro(dados.erro || I18N_NETWORK_TXT.erroConexao);
        return;
      }

      window.location.href = '/network?solicitado=1';
    } catch (erro) {
      mostrarErro(I18N_NETWORK_TXT.erroConexao);
    }
  });
}
