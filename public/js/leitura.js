// Le o PDF no navegador com o PDF.js e desenha uma pagina por vez, exatamente
// como no PDF original (canvas), com uma camada de texto invisivel por cima
// (text layer) na mesma posicao do texto desenhado — isso permite selecionar
// texto com o mouse. O arquivo tambem e enviado e guardado no servidor
// (pasta uploads/), pra dar pra reabrir e baixar depois sem reenviar.
//
// Mostrar so uma pagina por vez (em vez do documento inteiro de uma vez) evita
// que o navegador role a tela sozinho no meio de uma selecao de texto — o que
// bagunçava a selecao em documentos longos.

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const ESCALA_RENDER = 1.5;

const formUpload = document.getElementById('form-upload');
const campoArquivo = document.getElementById('arquivo-pdf');
const campoTitulo = document.getElementById('titulo-documento');
const selectArtigo = document.getElementById('artigo-vinculado');
const statusUpload = document.getElementById('status-upload');

const areaLeitura = document.getElementById('area-leitura');
const visorPdf = document.getElementById('visor-texto');
const buscaTexto = document.getElementById('busca-texto');
const botaoBuscarTexto = document.getElementById('botao-buscar-texto');
const avisoBuscaTexto = document.getElementById('aviso-busca-texto');
const listaDestaquesAtual = document.getElementById('lista-destaques-atual');

const botaoPaginaAnterior = document.getElementById('botao-pagina-anterior');
const botaoPaginaSeguinte = document.getElementById('botao-pagina-seguinte');
const indicadorPagina = document.getElementById('indicador-pagina');

const popupMarcar = document.getElementById('popup-marcar');
const botaoMarcar = document.getElementById('botao-marcar');

const dropzoneArquivo = document.getElementById('dropzone-arquivo');
const dropzoneTexto = document.getElementById('dropzone-texto');

let documentoAtualId = null;
let pdfAtual = null;
let paginaAtualNumero = 1;
let paginasComOcorrencia = []; // numeros de pagina (em ordem) que tem o termo buscado
let indiceBuscaAtual = -1;
let ultimoTermoBuscado = '';
let excertoSelecionadoAtual = '';

campoArquivo.addEventListener('change', () => {
  const arquivo = campoArquivo.files[0];
  if (!arquivo) return;

  if (!campoTitulo.value.trim()) {
    campoTitulo.value = nomeParaTitulo(arquivo.name);
  }
  dropzoneTexto.innerHTML = `<strong>${escaparHtml(arquivo.name)}</strong><small>Clique ou arraste outro arquivo para trocar</small>`;
});

// Arrastar e soltar um PDF na zona de envio (alem de clicar e escolher).
['dragover', 'dragenter'].forEach((evento) => {
  dropzoneArquivo.addEventListener(evento, (e) => {
    e.preventDefault();
    dropzoneArquivo.classList.add('arrastando');
  });
});

['dragleave', 'dragend'].forEach((evento) => {
  dropzoneArquivo.addEventListener(evento, () => {
    dropzoneArquivo.classList.remove('arrastando');
  });
});

dropzoneArquivo.addEventListener('drop', (evento) => {
  evento.preventDefault();
  dropzoneArquivo.classList.remove('arrastando');

  const arquivo = evento.dataTransfer.files[0];
  if (!arquivo) return;
  if (arquivo.type !== 'application/pdf') {
    statusUpload.textContent = 'Envie apenas arquivos PDF.';
    statusUpload.classList.add('erro-texto');
    return;
  }

  campoArquivo.files = evento.dataTransfer.files;
  campoArquivo.dispatchEvent(new Event('change'));
});

// Deixa o nome do arquivo mais parecido com um titulo de verdade (nomes
// baixados de sites costumam vir com "+" ou "%20" no lugar de espaco).
function nomeParaTitulo(nomeArquivo) {
  let nome = nomeArquivo.replace(/\.pdf$/i, '');
  try {
    nome = decodeURIComponent(nome);
  } catch (erro) {
    // nome nao estava codificado (ou veio invalido) - usa como esta
  }
  return nome.replace(/[+_]/g, ' ').trim();
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function criarFichaDestaque(destaque) {
  const item = document.createElement('div');
  item.className = 'destaque-item';
  item.innerHTML = `<p>"${escaparHtml(destaque.excerpt)}"</p>`;
  return item;
}

// Desenha a pagina indicada num <canvas> (visual identico ao PDF) e sobrepoe
// uma camada de spans de texto invisiveis, na mesma posicao, pra permitir
// selecionar/buscar texto. Retorna quantos itens de texto foram encontrados
// (0 = PDF de imagem escaneada, sem texto selecionavel).
async function renderizarPagina(numero) {
  visorPdf.innerHTML = '';
  esconderPopupMarcar();

  const pagina = await pdfAtual.getPage(numero);
  const viewport = pagina.getViewport({ scale: ESCALA_RENDER });

  const wrapper = document.createElement('div');
  wrapper.className = 'pagina-pdf';
  wrapper.style.width = `${viewport.width}px`;
  wrapper.style.height = `${viewport.height}px`;
  wrapper.style.setProperty('--scale-factor', String(viewport.scale));
  visorPdf.appendChild(wrapper);

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  wrapper.appendChild(canvas);
  const contexto = canvas.getContext('2d');
  await pagina.render({ canvasContext: contexto, viewport }).promise;

  const camadaTexto = document.createElement('div');
  camadaTexto.className = 'textLayer';
  wrapper.appendChild(camadaTexto);

  const conteudoTexto = await pagina.getTextContent();
  await pdfjsLib.renderTextLayer({
    textContentSource: conteudoTexto,
    container: camadaTexto,
    viewport,
  }).promise;

  paginaAtualNumero = numero;
  indicadorPagina.textContent = `Página ${numero} de ${pdfAtual.numPages}`;
  botaoPaginaAnterior.disabled = numero <= 1;
  botaoPaginaSeguinte.disabled = numero >= pdfAtual.numPages;

  if (paginasComOcorrencia.includes(numero) && ultimoTermoBuscado) {
    destacarTermoNaPaginaAtual(ultimoTermoBuscado);
  }

  return conteudoTexto.items.length;
}

function destacarTermoNaPaginaAtual(termo) {
  const termoNormalizado = termo.toLowerCase();
  const linhas = Array.from(visorPdf.querySelectorAll('.textLayer span')).filter((span) =>
    span.textContent.toLowerCase().includes(termoNormalizado)
  );
  linhas.forEach((span) => span.classList.add('linha-encontrada'));
  if (linhas.length > 0) {
    linhas[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Reinicia o estado de busca/paginas e abre a area de leitura, com o PDF ja
// carregado no pdf.js (pdfAtual). Compartilhado entre "enviar PDF novo" e
// "reabrir PDF ja guardado".
async function iniciarLeitura() {
  paginasComOcorrencia = [];
  ultimoTermoBuscado = '';
  indiceBuscaAtual = -1;
  buscaTexto.value = '';
  avisoBuscaTexto.textContent = '';

  const totalItensDeTexto = await renderizarPagina(1);
  areaLeitura.style.display = 'block';
  areaLeitura.scrollIntoView({ behavior: 'smooth' });
  return totalItensDeTexto;
}

formUpload.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const arquivo = campoArquivo.files[0];
  if (!arquivo) return;

  statusUpload.textContent = 'Enviando e lendo o PDF...';
  statusUpload.classList.remove('erro-texto');

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    pdfAtual = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const formData = new FormData();
    formData.append('pdf', arquivo);
    formData.append('title', campoTitulo.value.trim());
    if (selectArtigo.value) formData.append('articleId', selectArtigo.value);

    const resposta = await fetch('/api/documentos', { method: 'POST', body: formData });
    const dados = await resposta.json();

    if (!resposta.ok) {
      statusUpload.textContent = dados.erro || 'Não foi possível salvar o documento.';
      statusUpload.classList.add('erro-texto');
      return;
    }

    documentoAtualId = dados.documento.id;
    listaDestaquesAtual.innerHTML = '';
    const totalItensDeTexto = await iniciarLeitura();

    statusUpload.textContent =
      totalItensDeTexto > 0
        ? `PDF carregado: ${pdfAtual.numPages} página(s).`
        : 'O PDF foi salvo, mas não encontrei texto selecionável nele (pode ser uma imagem escaneada) — a busca e a marcação de trechos podem não funcionar.';
    statusUpload.classList.toggle('erro-texto', totalItensDeTexto === 0);
  } catch (erro) {
    statusUpload.textContent = 'Não foi possível ler esse PDF. Verifique se o arquivo não está corrompido.';
    statusUpload.classList.add('erro-texto');
  }
});

// "Visualizar" num card de "Meus documentos": busca o arquivo ja guardado no
// servidor e retoma a leitura (com os trechos-chave que ja existiam).
document.addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-acao="visualizar-documento"]');
  if (!botao) return;

  const id = botao.dataset.documentoId;
  const titulo = botao.dataset.documentoTitulo || '';

  statusUpload.textContent = 'Carregando PDF salvo...';
  statusUpload.classList.remove('erro-texto');

  try {
    const resposta = await fetch(`/documentos/${id}/arquivo`);
    if (!resposta.ok) {
      const texto = await resposta.text();
      throw new Error(texto || 'Não foi possível carregar o arquivo.');
    }

    const arrayBuffer = await resposta.arrayBuffer();
    documentoAtualId = Number(id);
    pdfAtual = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    listaDestaquesAtual.innerHTML = '';
    const template = document.getElementById('trechos-doc-' + id);
    if (template) {
      template.content.querySelectorAll('.destaque-item').forEach((item) => {
        listaDestaquesAtual.appendChild(item.cloneNode(true));
      });
    }

    const totalItensDeTexto = await iniciarLeitura();
    statusUpload.textContent =
      totalItensDeTexto > 0
        ? `"${titulo}" — ${pdfAtual.numPages} página(s).`
        : 'Esse PDF não tem texto selecionável (pode ser uma imagem escaneada).';
  } catch (erro) {
    statusUpload.textContent = erro.message || 'Não foi possível carregar esse PDF salvo.';
    statusUpload.classList.add('erro-texto');
  }
});

botaoPaginaAnterior.addEventListener('click', () => {
  if (paginaAtualNumero > 1) renderizarPagina(paginaAtualNumero - 1);
});

botaoPaginaSeguinte.addEventListener('click', () => {
  if (pdfAtual && paginaAtualNumero < pdfAtual.numPages) renderizarPagina(paginaAtualNumero + 1);
});

// Busca em todas as paginas do documento (usando o texto, sem precisar
// desenhar cada uma) e leva o professor ate a proxima pagina que contem o
// termo, destacando a(s) linha(s) inteira(s) onde ele aparece.
botaoBuscarTexto.addEventListener('click', async () => {
  const termo = buscaTexto.value.trim();

  visorPdf.querySelectorAll('.textLayer span.linha-encontrada').forEach((span) => {
    span.classList.remove('linha-encontrada');
  });

  if (!termo) {
    avisoBuscaTexto.textContent = '';
    ultimoTermoBuscado = '';
    return;
  }

  if (termo !== ultimoTermoBuscado) {
    avisoBuscaTexto.textContent = 'Procurando em todas as páginas...';
    paginasComOcorrencia = await encontrarPaginasComTermo(termo);
    indiceBuscaAtual = -1;
    ultimoTermoBuscado = termo;
  }

  if (paginasComOcorrencia.length === 0) {
    avisoBuscaTexto.textContent = 'Nenhuma ocorrência encontrada neste documento.';
    return;
  }

  indiceBuscaAtual = (indiceBuscaAtual + 1) % paginasComOcorrencia.length;
  const paginaAlvo = paginasComOcorrencia[indiceBuscaAtual];

  if (paginaAlvo !== paginaAtualNumero) {
    await renderizarPagina(paginaAlvo);
  } else {
    destacarTermoNaPaginaAtual(termo);
  }

  avisoBuscaTexto.textContent = `Encontrado na página ${paginaAlvo} — ocorrência ${indiceBuscaAtual + 1} de ${
    paginasComOcorrencia.length
  }.`;
});

async function encontrarPaginasComTermo(termo) {
  const termoNormalizado = termo.toLowerCase();
  const paginas = [];
  for (let numero = 1; numero <= pdfAtual.numPages; numero++) {
    const pagina = await pdfAtual.getPage(numero);
    const conteudo = await pagina.getTextContent();
    const contemTermo = conteudo.items.some((item) => item.str.toLowerCase().includes(termoNormalizado));
    if (contemTermo) paginas.push(numero);
  }
  return paginas;
}

// Popup que aparece perto do mouse quando o professor seleciona um trecho de
// texto dentro do PDF, com um botao pra marcar aquele trecho como chave.
function esconderPopupMarcar() {
  popupMarcar.style.display = 'none';
  excertoSelecionadoAtual = '';
}

function mostrarPopupMarcar(x, y, textoSelecionado) {
  excertoSelecionadoAtual = textoSelecionado;
  popupMarcar.style.display = 'block';

  const alturaPopup = popupMarcar.offsetHeight || 44;
  const larguraPopup = popupMarcar.offsetWidth || 180;
  let top = y - alturaPopup - 10;
  let left = x - larguraPopup / 2;

  if (top < 10) top = y + 20; // sem espaco acima: mostra abaixo do cursor
  if (left < 10) left = 10;
  const maxLeft = window.innerWidth - larguraPopup - 10;
  if (left > maxLeft) left = maxLeft;

  popupMarcar.style.top = `${top + window.scrollY}px`;
  popupMarcar.style.left = `${left + window.scrollX}px`;
}

document.addEventListener('mouseup', (evento) => {
  if (popupMarcar.contains(evento.target)) return; // clique no proprio popup

  const selecaoObj = window.getSelection();
  const selecao = selecaoObj.toString().trim();

  if (!selecao || !visorPdf.contains(selecaoObj.anchorNode)) {
    esconderPopupMarcar();
    return;
  }

  mostrarPopupMarcar(evento.clientX, evento.clientY, selecao);
});

document.addEventListener('mousedown', (evento) => {
  if (!popupMarcar.contains(evento.target) && !visorPdf.contains(evento.target)) {
    esconderPopupMarcar();
  }
});

botaoMarcar.addEventListener('click', async () => {
  if (!excertoSelecionadoAtual || !documentoAtualId) return;

  try {
    const resposta = await fetch(`/api/documentos/${documentoAtualId}/destaques`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excerpt: excertoSelecionadoAtual }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      window.alert(dados.erro || 'Não foi possível marcar esse trecho.');
      return;
    }

    listaDestaquesAtual.prepend(criarFichaDestaque(dados.destaque));
    window.getSelection().removeAllRanges();
    esconderPopupMarcar();
  } catch (erro) {
    window.alert('Erro de conexão ao marcar o trecho.');
  }
});

// Busca/ordena os cards de "Meus documentos" (so no que ja esta na tela,
// sem precisar recarregar a pagina).
const campoBuscaDocumentos = document.getElementById('busca-documentos');
const selectOrdenarDocumentos = document.getElementById('ordenar-documentos');
const gradeDocumentos = document.getElementById('grade-documentos');

if (gradeDocumentos) {
  const cardsDocumentos = Array.from(gradeDocumentos.querySelectorAll('.ficha-documento'));

  function aplicarFiltroDocumentos() {
    const termo = (campoBuscaDocumentos.value || '').toLowerCase().trim();
    cardsDocumentos.forEach((card) => {
      const titulo = card.dataset.titulo || '';
      card.style.display = titulo.includes(termo) ? '' : 'none';
    });
  }

  function aplicarOrdenacaoDocumentos() {
    const modo = selectOrdenarDocumentos.value;
    const ordenados = cardsDocumentos.slice().sort((a, b) => {
      if (modo === 'nome') return a.dataset.titulo.localeCompare(b.dataset.titulo);
      if (modo === 'antigos') return Number(a.dataset.timestamp) - Number(b.dataset.timestamp);
      return Number(b.dataset.timestamp) - Number(a.dataset.timestamp); // recentes (padrao)
    });
    ordenados.forEach((card) => gradeDocumentos.appendChild(card));
  }

  if (campoBuscaDocumentos) campoBuscaDocumentos.addEventListener('input', aplicarFiltroDocumentos);
  if (selectOrdenarDocumentos) selectOrdenarDocumentos.addEventListener('change', aplicarOrdenacaoDocumentos);
}

// Pede confirmacao (com um modal no estilo do site, em vez do popup feio
// padrao do navegador) antes de qualquer form marcado com data-confirm ser
// enviado — usado nos botoes "Remover" de documento e de trecho-chave.
const modalConfirmar = document.getElementById('modal-confirmar');
const modalConfirmarFundo = document.getElementById('modal-confirmar-fundo');
const modalConfirmarMensagem = document.getElementById('modal-confirmar-mensagem');
const modalConfirmarCancelar = document.getElementById('modal-confirmar-cancelar');
const modalConfirmarRemover = document.getElementById('modal-confirmar-remover');

function pedirConfirmacao(mensagem) {
  return new Promise((resolve) => {
    modalConfirmarMensagem.textContent = mensagem;
    modalConfirmar.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    function encerrar(resultado) {
      modalConfirmar.style.display = 'none';
      document.body.style.overflow = '';
      modalConfirmarRemover.removeEventListener('click', aoRemover);
      modalConfirmarCancelar.removeEventListener('click', aoCancelar);
      modalConfirmarFundo.removeEventListener('click', aoCancelar);
      resolve(resultado);
    }
    function aoRemover() {
      encerrar(true);
    }
    function aoCancelar() {
      encerrar(false);
    }

    modalConfirmarRemover.addEventListener('click', aoRemover);
    modalConfirmarCancelar.addEventListener('click', aoCancelar);
    modalConfirmarFundo.addEventListener('click', aoCancelar);
  });
}

if (modalConfirmar) {
  document.addEventListener('submit', async (evento) => {
    const mensagem = evento.target.dataset && evento.target.dataset.confirm;
    if (!mensagem) return;

    evento.preventDefault();
    const confirmou = await pedirConfirmacao(mensagem);
    if (confirmou) evento.target.submit();
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && modalConfirmar.style.display !== 'none') {
      modalConfirmarCancelar.click();
    }
  });
}
