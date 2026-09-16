// Le o PDF inteiramente no navegador com o PDF.js (o arquivo nao e enviado ao
// servidor) e desenha cada pagina exatamente como no PDF original (canvas),
// com uma camada de texto invisivel por cima (text layer) na mesma posicao do
// texto desenhado — isso permite selecionar texto com o mouse normalmente,
// mesmo a pagina sendo "uma imagem". A busca usa window.find() do proprio
// navegador, que enxerga esse texto e destaca/rola ate ele, como um Ctrl+F.

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
const botaoMarcar = document.getElementById('botao-marcar');
const listaDestaquesAtual = document.getElementById('lista-destaques-atual');

let documentoAtualId = null;

campoArquivo.addEventListener('change', () => {
  if (campoArquivo.files[0] && !campoTitulo.value.trim()) {
    campoTitulo.value = campoArquivo.files[0].name.replace(/\.pdf$/i, '');
  }
});

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

// Desenha cada pagina num <canvas> (visual identico ao PDF) e sobrepoe uma
// camada de spans de texto invisiveis, na mesma posicao, pra permitir
// selecionar/buscar texto. Retorna quantos itens de texto foram encontrados
// ao todo (0 = PDF de imagem escaneada, sem texto selecionavel).
async function renderizarPdf(pdf) {
  visorPdf.innerHTML = '';
  let totalItensDeTexto = 0;

  for (let numero = 1; numero <= pdf.numPages; numero++) {
    const pagina = await pdf.getPage(numero);
    const viewport = pagina.getViewport({ scale: ESCALA_RENDER });

    const wrapper = document.createElement('div');
    wrapper.className = 'pagina-pdf';
    wrapper.style.width = `${viewport.width}px`;
    wrapper.style.height = `${viewport.height}px`;
    // O PDF.js usa essa variavel de CSS pra posicionar a camada de texto na
    // mesma escala do canvas desenhado.
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
    totalItensDeTexto += conteudoTexto.items.length;
  }

  return totalItensDeTexto;
}

formUpload.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const arquivo = campoArquivo.files[0];
  if (!arquivo) return;

  statusUpload.textContent = 'Lendo o PDF...';
  statusUpload.classList.remove('erro-texto');

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalItensDeTexto = await renderizarPdf(pdf);

    if (totalItensDeTexto === 0) {
      statusUpload.textContent =
        'O PDF foi exibido, mas não encontrei texto selecionável nele (pode ser uma imagem escaneada) — a busca e a marcação de trechos podem não funcionar.';
      statusUpload.classList.add('erro-texto');
    }

    const resposta = await fetch('/api/documentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: campoTitulo.value.trim(),
        articleId: selectArtigo.value || null,
      }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      statusUpload.textContent = dados.erro || 'Não foi possível salvar o documento.';
      statusUpload.classList.add('erro-texto');
      return;
    }

    documentoAtualId = dados.documento.id;
    if (totalItensDeTexto > 0) {
      statusUpload.textContent = `PDF carregado: ${pdf.numPages} página(s).`;
    }

    buscaTexto.value = '';
    avisoBuscaTexto.textContent = '';
    listaDestaquesAtual.innerHTML = '';
    areaLeitura.style.display = 'block';
    areaLeitura.scrollIntoView({ behavior: 'smooth' });
  } catch (erro) {
    statusUpload.textContent = 'Não foi possível ler esse PDF. Verifique se o arquivo não está corrompido.';
    statusUpload.classList.add('erro-texto');
  }
});

// Busca feita por nos (em vez de window.find do navegador): o PDF.js as vezes
// agrupa uma linha inteira num unico "span" de texto. Usar window.find nesses
// casos destacava a caixinha na posicao errada da linha (testado com PDFs
// reais). Por isso destacamos a linha inteira que contem o termo — a posicao
// dessa caixa e sempre a correta, porque e a mesma caixa do proprio span.
let ultimoTermoBuscado = '';
let indiceBuscaAtual = -1;

botaoBuscarTexto.addEventListener('click', () => {
  const termo = buscaTexto.value.trim();

  visorPdf.querySelectorAll('.textLayer span.linha-encontrada').forEach((span) => {
    span.classList.remove('linha-encontrada');
  });

  if (!termo) {
    avisoBuscaTexto.textContent = '';
    ultimoTermoBuscado = '';
    return;
  }

  const termoNormalizado = termo.toLowerCase();
  const linhasEncontradas = Array.from(visorPdf.querySelectorAll('.textLayer span')).filter((span) =>
    span.textContent.toLowerCase().includes(termoNormalizado)
  );

  if (linhasEncontradas.length === 0) {
    avisoBuscaTexto.textContent = 'Nenhuma ocorrência encontrada neste documento.';
    ultimoTermoBuscado = '';
    return;
  }

  indiceBuscaAtual = termo === ultimoTermoBuscado ? (indiceBuscaAtual + 1) % linhasEncontradas.length : 0;
  ultimoTermoBuscado = termo;

  linhasEncontradas.forEach((span) => span.classList.add('linha-encontrada'));
  linhasEncontradas[indiceBuscaAtual].scrollIntoView({ behavior: 'smooth', block: 'center' });

  avisoBuscaTexto.textContent = `${linhasEncontradas.length} linha(s) encontrada(s) — mostrando ${
    indiceBuscaAtual + 1
  } de ${linhasEncontradas.length}.`;
});

botaoMarcar.addEventListener('click', async () => {
  const selecaoObj = window.getSelection();
  const selecao = selecaoObj.toString().trim();

  if (!selecao || !visorPdf.contains(selecaoObj.anchorNode)) {
    window.alert('Selecione um trecho de texto dentro do PDF antes de clicar em marcar.');
    return;
  }
  if (!documentoAtualId) return;

  try {
    const resposta = await fetch(`/api/documentos/${documentoAtualId}/destaques`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ excerpt: selecao }),
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      window.alert(dados.erro || 'Não foi possível marcar esse trecho.');
      return;
    }

    listaDestaquesAtual.prepend(criarFichaDestaque(dados.destaque));
    selecaoObj.removeAllRanges();
  } catch (erro) {
    window.alert('Erro de conexão ao marcar o trecho.');
  }
});
