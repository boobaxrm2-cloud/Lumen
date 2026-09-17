// Busca artigos no Semantic Scholar (via nosso backend) e permite salvar/descartar
// cada resultado. Os artigos salvos ficam na pagina "Biblioteca" (/biblioteca).

const formBusca = document.getElementById('form-busca');
const campoBusca = document.getElementById('campo-busca');
const containerResultados = document.getElementById('resultados');
const avisoBusca = document.getElementById('aviso-busca');
const contagemResultados = document.getElementById('contagem-resultados');
const areaCarregarMais = document.getElementById('area-carregar-mais');
const botaoCarregarMais = document.getElementById('botao-carregar-mais');

const filtroAnoDe = document.getElementById('filtro-ano-de');
const filtroAnoAte = document.getElementById('filtro-ano-ate');
const botaoAplicarFiltros = document.getElementById('botao-aplicar-filtros');
const botaoLimparFiltros = document.getElementById('botao-limpar-filtros');
const selectOrdenar = document.getElementById('select-ordenar');
const botaoVisualGrade = document.getElementById('botao-visual-grade');
const botaoVisualLista = document.getElementById('botao-visual-lista');

let termoAtual = '';
let proximoOffset = null;
// Guarda os artigos e seus elementos na ordem original (relevancia) da API,
// pra dar pra "desfazer" a ordenacao por mais recente sem buscar de novo.
let resultadosCarregados = [];

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto || '';
  return div.innerHTML;
}

function truncar(texto, tamanho) {
  if (!texto) return '';
  return texto.length > tamanho ? texto.slice(0, tamanho) + '…' : texto;
}

function linkDoArtigo(artigo) {
  if (artigo.doi) return 'https://doi.org/' + artigo.doi;
  return artigo.url || null;
}

function criarFichaResultado(artigo) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-artigo';

  const link = linkDoArtigo(artigo);
  const resumo = truncar(artigo.abstract, 280);

  ficha.innerHTML = `
    <div class="cabecalho-ficha">
      <h3>${escaparHtml(artigo.title)}</h3>
      ${artigo.year ? `<span class="ano">${escaparHtml(String(artigo.year))}</span>` : ''}
    </div>
    ${artigo.authors ? `<p class="autores">${escaparHtml(artigo.authors)}</p>` : ''}
    ${artigo.venue ? `<p class="veiculo">${escaparHtml(artigo.venue)}</p>` : ''}
    ${resumo ? `<p class="resumo">${escaparHtml(resumo)}</p>` : ''}
    ${link ? `<p class="link-artigo"><a href="${escaparHtml(link)}" target="_blank" rel="noopener">Abrir artigo ↗</a></p>` : ''}
    ${
      artigo.pdfAberto
        ? `<div class="acoes-pdf">
            <button class="botao secundario" type="button" data-acao="previa-pdf" data-pdf-url="${escaparHtml(artigo.pdfAberto)}" data-pdf-titulo="${escaparHtml(artigo.title)}">
              <svg class="icone" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
              Pré-visualizar
            </button>
            <a class="botao secundario" href="/pdf-externo?url=${encodeURIComponent(artigo.pdfAberto)}&baixar=1" target="_blank" rel="noopener">
              <svg class="icone" viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M4 19h16"/></svg>
              Baixar PDF
            </a>
          </div>`
        : ''
    }
    <div class="acoes">
      <button class="botao" type="button" data-acao="salvar">Salvar</button>
      <button class="botao secundario" type="button" data-acao="descartar">Descartar</button>
    </div>
  `;

  ficha.querySelector('[data-acao="descartar"]').addEventListener('click', () => {
    ficha.remove();
    resultadosCarregados = resultadosCarregados.filter((item) => item.elemento !== ficha);
  });

  ficha.querySelector('[data-acao="salvar"]').addEventListener('click', (evento) => {
    salvarArtigo(artigo, ficha, evento.target);
  });

  return ficha;
}

function obterFiltrosAtuais() {
  return {
    anoDe: filtroAnoDe.value.trim(),
    anoAte: filtroAnoAte.value.trim(),
    tipos: Array.from(document.querySelectorAll('.filtro-tipo:checked')).map((cb) => cb.value),
  };
}

async function buscarArtigos(termo, { comecarDoZero = true } = {}) {
  if (comecarDoZero) {
    termoAtual = termo;
    proximoOffset = 0;
    containerResultados.innerHTML = '';
    resultadosCarregados = [];
    contagemResultados.textContent = '';
  }

  avisoBusca.textContent = 'Buscando...';
  avisoBusca.classList.remove('erro-texto');

  try {
    const filtros = obterFiltrosAtuais();
    const params = new URLSearchParams({ q: termo, offset: String(proximoOffset || 0) });
    if (filtros.anoDe) params.set('anoDe', filtros.anoDe);
    if (filtros.anoAte) params.set('anoAte', filtros.anoAte);
    if (filtros.tipos.length > 0) params.set('tipos', filtros.tipos.join(','));

    const resposta = await fetch('/api/artigos/buscar?' + params.toString());
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisoBusca.textContent = dados.erro || 'Não foi possível buscar agora.';
      avisoBusca.classList.add('erro-texto');
      areaCarregarMais.style.display = 'none';
      return;
    }

    if (dados.resultados.length === 0 && comecarDoZero) {
      avisoBusca.textContent = 'Nenhum resultado encontrado com esses termos/filtros.';
      areaCarregarMais.style.display = 'none';
      return;
    }

    avisoBusca.textContent = '';
    dados.resultados.forEach((artigo) => {
      const elemento = criarFichaResultado(artigo);
      resultadosCarregados.push({ artigo, elemento });
      containerResultados.appendChild(elemento);
    });

    aplicarOrdenacao();

    contagemResultados.textContent = `Mostrando ${resultadosCarregados.length} de ${dados.total} resultado(s).`;

    proximoOffset = dados.proximoOffset;
    areaCarregarMais.style.display = proximoOffset ? 'flex' : 'none';
  } catch (erro) {
    avisoBusca.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
    avisoBusca.classList.add('erro-texto');
  }
}

// Reordena os cartoes ja carregados na tela. "Mais recentes" so afeta o que
// ja foi buscado (a Semantic Scholar nao deixa ordenar isso no servidor);
// "Mais relevantes" volta pra ordem original que a API devolveu.
function aplicarOrdenacao() {
  const modo = selectOrdenar.value;
  const lista = resultadosCarregados.slice();

  if (modo === 'recente') {
    lista.sort((a, b) => (b.artigo.year || 0) - (a.artigo.year || 0));
  }

  lista.forEach((item) => containerResultados.appendChild(item.elemento));
}

async function salvarArtigo(artigo, ficha, botao, forcar) {
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    const resposta = await fetch('/api/artigos/salvar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, artigo, { forcar: !!forcar })),
    });
    const dados = await resposta.json();

    if (resposta.status === 409 && dados.duplicado) {
      const confirmar = window.confirm(dados.mensagem + '\n\nSalvar mesmo assim?');
      botao.disabled = false;
      botao.textContent = 'Salvar';
      if (confirmar) {
        salvarArtigo(artigo, ficha, botao, true);
      }
      return;
    }

    if (!resposta.ok) {
      window.alert(dados.erro || 'Não foi possível salvar este artigo.');
      botao.disabled = false;
      botao.textContent = 'Salvar';
      return;
    }

    botao.textContent = 'Salvo ✓ — ver na Biblioteca';
    ficha.classList.add('ja-salva');
    ficha.querySelector('[data-acao="descartar"]').remove();
  } catch (erro) {
    window.alert('Erro de conexão ao salvar o artigo.');
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
}

formBusca.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const termo = campoBusca.value.trim();
  if (termo) buscarArtigos(termo);
});

botaoCarregarMais.addEventListener('click', () => {
  if (termoAtual && proximoOffset != null) {
    buscarArtigos(termoAtual, { comecarDoZero: false });
  }
});

botaoAplicarFiltros.addEventListener('click', () => {
  const termo = campoBusca.value.trim();
  if (termo) buscarArtigos(termo);
});

botaoLimparFiltros.addEventListener('click', () => {
  filtroAnoDe.value = '';
  filtroAnoAte.value = '';
  document.querySelectorAll('.filtro-tipo:checked').forEach((cb) => (cb.checked = false));
  const termo = campoBusca.value.trim();
  if (termo) buscarArtigos(termo);
});

selectOrdenar.addEventListener('change', aplicarOrdenacao);

function alternarVisual(visual) {
  containerResultados.classList.toggle('visual-lista', visual === 'lista');
  botaoVisualGrade.classList.toggle('ativo', visual === 'grade');
  botaoVisualLista.classList.toggle('ativo', visual === 'lista');
}

botaoVisualGrade.addEventListener('click', () => alternarVisual('grade'));
botaoVisualLista.addEventListener('click', () => alternarVisual('lista'));

// Se a pagina chegou com um termo (ex: busca feita pela caixa do cabecalho),
// dispara a busca automaticamente.
if (campoBusca.value.trim()) {
  buscarArtigos(campoBusca.value.trim());
}
