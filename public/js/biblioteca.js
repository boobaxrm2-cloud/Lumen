// Modal de "compartilhar biblioteca", em 2 etapas: email -> confirmar Sim/Nao.
// Mesmo esqueleto do modal de recuperacao de senha em public/js/login.js.

const botaoAbrirCompartilhar = document.getElementById('botao-compartilhar-biblioteca');

if (botaoAbrirCompartilhar) {
  const I18N_BIBLIOTECA_TXT = window.I18N_BIBLIOTECA;

  const modal = document.getElementById('modal-compartilhar');
  const modalFundo = document.getElementById('modal-compartilhar-fundo');
  const status = document.getElementById('compartilhar-status');

  const etapaEmail = document.getElementById('compartilhar-etapa-email');
  const etapaConfirmar = document.getElementById('compartilhar-etapa-confirmar');

  const campoEmail = document.getElementById('compartilhar-email');
  const textoConfirmar = document.getElementById('compartilhar-confirmar-texto');

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

  botaoAbrirCompartilhar.addEventListener('click', abrirModal);
  document.getElementById('botao-compartilhar-cancelar').addEventListener('click', fecharModal);
  document.getElementById('botao-compartilhar-nao').addEventListener('click', fecharModal);
  modalFundo.addEventListener('click', fecharModal);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modal.style.display !== 'none') fecharModal();
  });

  document.getElementById('botao-compartilhar-continuar').addEventListener('click', async () => {
    const email = campoEmail.value.trim();
    if (!email) return;

    status.textContent = '';
    status.classList.remove('erro-texto');

    try {
      const resposta = await fetch('/api/biblioteca/compartilhar/verificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarErro(dados.erro || I18N_BIBLIOTECA_TXT.erroConexao);
        return;
      }

      emailAtual = email;
      textoConfirmar.textContent = preencher(I18N_BIBLIOTECA_TXT.confirmarTexto, {
        nome: dados.nome,
        email: dados.email,
      });
      etapaEmail.style.display = 'none';
      etapaConfirmar.style.display = '';
    } catch (erro) {
      mostrarErro(I18N_BIBLIOTECA_TXT.erroConexao);
    }
  });

  document.getElementById('botao-compartilhar-sim').addEventListener('click', async () => {
    status.textContent = '';
    status.classList.remove('erro-texto');

    try {
      const resposta = await fetch('/api/biblioteca/compartilhar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailAtual }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        mostrarErro(dados.erro || I18N_BIBLIOTECA_TXT.erroConexao);
        return;
      }

      window.location.href = '/biblioteca?compartilhado=1';
    } catch (erro) {
      mostrarErro(I18N_BIBLIOTECA_TXT.erroConexao);
    }
  });
}
