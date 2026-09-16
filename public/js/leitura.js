// Le o PDF inteiramente no navegador com o PDF.js (o arquivo nao e enviado ao
// servidor) e permite buscar/destacar trechos e marcar excertos-chave, que ai
// sim sao salvos no banco vinculados ao documento e ao usuario.

import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';

const formUpload = document.getElementById('form-upload');
const campoArquivo = document.getElementById('arquivo-pdf');
const campoTitulo = document.getElementById('titulo-documento');
const selectArtigo = document.getElementById('artigo-vinculado');
const statusUpload = document.getElementById('status-upload');

const areaLeitura = document.getElementById('area-leitura');
const visorTexto = document.getElementById('visor-texto');
const buscaTexto = document.getElementById('busca-texto');
const botaoBuscarTexto = document.getElementById('botao-buscar-texto');
const avisoBuscaTexto = document.getElementById('aviso-busca-texto');
const botaoMarcar = document.getElementById('botao-marcar');
const listaDestaquesAtual = document.getElementById('lista-destaques-atual');

let documentoAtualId = null;
let textoCompleto = '';

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

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exibirTexto(texto, termoBusca) {
  if (!termoBusca) {
    visorTexto.textContent = texto;
    return;
  }
  const escapado = escaparHtml(texto);
  const regex = new RegExp('(' + escaparRegex(termoBusca) + ')', 'gi');
  visorTexto.innerHTML = escapado.replace(regex, '<mark>$1</mark>');
}

async function extrairTexto(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const pagina = await pdf.getPage(i);
    const conteudo = await pagina.getTextContent();
    texto += conteudo.items.map((item) => item.str).join(' ') + '\n\n';
  }
  return texto;
}

function criarFichaDestaque(destaque) {
  const item = document.createElement('div');
  item.className = 'destaque-item';
  item.innerHTML = `<p>"${escaparHtml(destaque.excerpt)}"</p>`;
  return item;
}

formUpload.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const arquivo = campoArquivo.files[0];
  if (!arquivo) return;

  statusUpload.textContent = 'Lendo o PDF...';
  statusUpload.classList.remove('erro-texto');

  try {
    const arrayBuffer = await arquivo.arrayBuffer();
    textoCompleto = await extrairTexto(arrayBuffer);

    if (!textoCompleto.trim()) {
      statusUpload.textContent =
        'Não encontrei texto nesse PDF (pode ser um PDF de imagem escaneada, sem texto selecionável).';
      statusUpload.classList.add('erro-texto');
      return;
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
    statusUpload.textContent = `PDF carregado (${textoCompleto.trim().length} caracteres extraídos).`;

    buscaTexto.value = '';
    avisoBuscaTexto.textContent = '';
    listaDestaquesAtual.innerHTML = '';
    exibirTexto(textoCompleto, '');
    areaLeitura.style.display = 'block';
    areaLeitura.scrollIntoView({ behavior: 'smooth' });
  } catch (erro) {
    statusUpload.textContent = 'Não foi possível ler esse PDF. Verifique se o arquivo não está corrompido.';
    statusUpload.classList.add('erro-texto');
  }
});

botaoBuscarTexto.addEventListener('click', () => {
  const termo = buscaTexto.value.trim();
  exibirTexto(textoCompleto, termo);

  if (!termo) {
    avisoBuscaTexto.textContent = '';
    return;
  }
  const ocorrencias = visorTexto.querySelectorAll('mark').length;
  avisoBuscaTexto.textContent = ocorrencias + ' ocorrência(s) encontrada(s).';
});

botaoMarcar.addEventListener('click', async () => {
  const selecaoObj = window.getSelection();
  const selecao = selecaoObj.toString().trim();

  if (!selecao || !visorTexto.contains(selecaoObj.anchorNode)) {
    window.alert('Selecione um trecho de texto dentro do visor antes de clicar em marcar.');
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
