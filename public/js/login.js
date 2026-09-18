// Fluxo de "esqueci minha senha" em 3 etapas, dentro de um modal na propria
// tela de login. Nao existe envio de email na plataforma - a recuperacao e
// feita respondendo a pergunta secreta escolhida no cadastro.

const I18N_LOGIN_TXT = window.I18N_LOGIN;

const modal = document.getElementById('modal-recuperar');
const modalFundo = document.getElementById('modal-recuperar-fundo');
const status = document.getElementById('recuperar-status');

const etapaEmail = document.getElementById('recuperar-etapa-email');
const etapaPergunta = document.getElementById('recuperar-etapa-pergunta');
const etapaSenha = document.getElementById('recuperar-etapa-senha');

const campoEmail = document.getElementById('recuperar-email');
const campoResposta = document.getElementById('recuperar-resposta');
const campoNovaSenha = document.getElementById('recuperar-nova-senha');
const campoConfirmarSenha = document.getElementById('recuperar-confirmar-senha');
const spanPergunta = document.getElementById('recuperar-pergunta');

let emailAtual = '';

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
  campoResposta.value = '';
  campoNovaSenha.value = '';
  campoConfirmarSenha.value = '';
  etapaEmail.style.display = '';
  etapaPergunta.style.display = 'none';
  etapaSenha.style.display = 'none';
}

function mostrarErro(mensagem) {
  status.textContent = mensagem;
  status.classList.add('erro-texto');
}

document.getElementById('botao-esqueci-senha').addEventListener('click', abrirModal);
document.getElementById('botao-recuperar-cancelar').addEventListener('click', fecharModal);
modalFundo.addEventListener('click', fecharModal);
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && modal.style.display !== 'none') fecharModal();
});

document.getElementById('botao-recuperar-continuar').addEventListener('click', async () => {
  const email = campoEmail.value.trim();
  if (!email) return;

  status.textContent = '';
  status.classList.remove('erro-texto');

  try {
    const resposta = await fetch('/api/recuperar-senha/pergunta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      mostrarErro(dados.erro || I18N_LOGIN_TXT.erroConexao);
      return;
    }

    emailAtual = email;
    spanPergunta.textContent = dados.pergunta;
    etapaEmail.style.display = 'none';
    etapaPergunta.style.display = '';
    campoResposta.focus();
  } catch (erro) {
    mostrarErro(I18N_LOGIN_TXT.erroConexao);
  }
});

document.getElementById('botao-recuperar-confirmar-resposta').addEventListener('click', async () => {
  const resposta = campoResposta.value.trim();
  if (!resposta) return;

  status.textContent = '';
  status.classList.remove('erro-texto');

  try {
    const res = await fetch('/api/recuperar-senha/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailAtual, resposta }),
    });
    const dados = await res.json();

    if (!res.ok) {
      mostrarErro(dados.erro || I18N_LOGIN_TXT.erroConexao);
      return;
    }

    etapaPergunta.style.display = 'none';
    etapaSenha.style.display = '';
    campoNovaSenha.focus();
  } catch (erro) {
    mostrarErro(I18N_LOGIN_TXT.erroConexao);
  }
});

document.getElementById('botao-recuperar-salvar').addEventListener('click', async () => {
  const novaSenha = campoNovaSenha.value;
  const confirmarSenha = campoConfirmarSenha.value;
  if (!novaSenha || !confirmarSenha) return;

  status.textContent = '';
  status.classList.remove('erro-texto');

  try {
    const res = await fetch('/api/recuperar-senha/nova-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ novaSenha, confirmarSenha }),
    });
    const dados = await res.json();

    if (!res.ok) {
      mostrarErro(dados.erro || I18N_LOGIN_TXT.erroConexao);
      return;
    }

    window.location.href = '/login?senhaAlterada=1';
  } catch (erro) {
    mostrarErro(I18N_LOGIN_TXT.erroConexao);
  }
});
