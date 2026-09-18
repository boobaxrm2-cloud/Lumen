// Modal de pre-visualizacao de PDF, usado nas paginas de Artigos e Biblioteca.
// Busca o PDF atraves do nosso proprio servidor (rota /pdf-externo) em vez de
// tentar ler direto do site de origem, porque a maioria dos sites nao libera
// isso pra outros dominios (CORS).

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const ESCALA_PREVIA = 1.3;
const I18N_PDF_TXT = window.I18N_PDF_PREVIEW;

function preencher(modelo, valores) {
  return modelo.replace(/\{(\w+)\}/g, (_, nome) => valores[nome]);
}

const modal = document.getElementById('modal-pdf');
const modalFundo = document.getElementById('modal-pdf-fundo');
const modalTitulo = document.getElementById('modal-pdf-titulo');
const modalCorpo = document.getElementById('modal-pdf-corpo');
const modalStatus = document.getElementById('modal-pdf-status');
const botaoFechar = document.getElementById('modal-pdf-fechar');
const botaoAnterior = document.getElementById('modal-pagina-anterior');
const botaoSeguinte = document.getElementById('modal-pagina-seguinte');
const indicadorPagina = document.getElementById('modal-indicador-pagina');

let pdfAtual = null;
let paginaAtual = 1;

function abrirModal() {
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharModal() {
  modal.style.display = 'none';
  document.body.style.overflow = '';
  modalCorpo.innerHTML = '';
  pdfAtual = null;
}

async function renderizarPaginaPrevia(numero) {
  modalCorpo.innerHTML = '';
  const pagina = await pdfAtual.getPage(numero);
  const viewport = pagina.getViewport({ scale: ESCALA_PREVIA });

  const canvas = document.createElement('canvas');
  canvas.className = 'pagina-pdf';
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  modalCorpo.appendChild(canvas);

  await pagina.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  paginaAtual = numero;
  indicadorPagina.textContent = preencher(I18N_PDF_TXT.pageIndicator, { atual: numero, total: pdfAtual.numPages });
  botaoAnterior.disabled = numero <= 1;
  botaoSeguinte.disabled = numero >= pdfAtual.numPages;
}

async function abrirPreviaPdf(url, titulo) {
  modalTitulo.textContent = titulo || I18N_PDF_TXT.title;
  modalCorpo.innerHTML = '';
  modalStatus.textContent = I18N_PDF_TXT.loading;
  modalCorpo.appendChild(modalStatus);
  indicadorPagina.textContent = preencher(I18N_PDF_TXT.pageIndicator, { atual: 1, total: 1 });
  botaoAnterior.disabled = true;
  botaoSeguinte.disabled = true;
  abrirModal();

  try {
    const resposta = await fetch('/pdf-externo?url=' + encodeURIComponent(url));
    if (!resposta.ok) throw new Error('falha ao buscar pdf');
    const arrayBuffer = await resposta.arrayBuffer();
    pdfAtual = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    await renderizarPaginaPrevia(1);
  } catch (erro) {
    modalCorpo.innerHTML = '';
    modalStatus.textContent = I18N_PDF_TXT.blockedFallback;
    modalCorpo.appendChild(modalStatus);
    const linkAlternativo = document.createElement('a');
    linkAlternativo.href = url;
    linkAlternativo.target = '_blank';
    linkAlternativo.rel = 'noopener';
    linkAlternativo.className = 'botao';
    linkAlternativo.style.marginTop = '1rem';
    linkAlternativo.textContent = I18N_PDF_TXT.openInNewTab;
    modalCorpo.appendChild(linkAlternativo);
  }
}

botaoFechar.addEventListener('click', fecharModal);
modalFundo.addEventListener('click', fecharModal);
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape' && modal.style.display !== 'none') fecharModal();
});

botaoAnterior.addEventListener('click', () => {
  if (pdfAtual && paginaAtual > 1) renderizarPaginaPrevia(paginaAtual - 1);
});
botaoSeguinte.addEventListener('click', () => {
  if (pdfAtual && paginaAtual < pdfAtual.numPages) renderizarPaginaPrevia(paginaAtual + 1);
});

// Delegacao de evento: funciona tanto pros cartoes que ja vem prontos na
// pagina quanto pros que o artigos.js cria depois de uma busca.
document.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-acao="previa-pdf"]');
  if (!botao) return;
  abrirPreviaPdf(botao.dataset.pdfUrl, botao.dataset.pdfTitulo);
});
