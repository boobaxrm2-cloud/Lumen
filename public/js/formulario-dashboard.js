// Depois de criar/remover/marcar um codigo, o servidor redireciona de volta
// com "#pergunta-ID" na URL - o navegador as vezes nao rola ate la sozinho
// (a pagina ja carrega com o hash, sem disparar o evento de navegacao que
// normalmente aciona a rolagem), entao forca aqui.
document.addEventListener('DOMContentLoaded', function () {
  if (window.location.hash) {
    const alvo = document.querySelector(window.location.hash);
    if (alvo) {
      // A pergunta de texto e um <details> recolhido por padrao - se acabou
      // de marcar/desmarcar um codigo nela, reabre pra mostrar o resultado
      // na hora, em vez da pessoa ter que clicar de novo pra ver.
      if (alvo.tagName === 'DETAILS') alvo.open = true;
      alvo.scrollIntoView();
    }
  }
});

// Botao "Copiar link" do dashboard de formulario.
document.addEventListener('DOMContentLoaded', function () {
  const botaoCopiar = document.getElementById('botao-copiar-link');
  const campoLink = document.getElementById('campo-link-publico');
  if (!botaoCopiar || !campoLink) return;

  botaoCopiar.addEventListener('click', function () {
    navigator.clipboard.writeText(campoLink.value).then(function () {
      const textoOriginal = botaoCopiar.textContent;
      botaoCopiar.textContent = I18N_FORMS_DASHBOARD.copiedNotice;
      setTimeout(function () {
        botaoCopiar.textContent = textoOriginal;
      }, 1800);
    });
  });
});
