// Busca artigos no Semantic Scholar (via nosso backend), permite salvar/descartar
// e atualiza a lista de artigos salvos sem recarregar a pagina.

const formBusca = document.getElementById('form-busca');
const campoBusca = document.getElementById('campo-busca');
const containerResultados = document.getElementById('resultados');
const containerSalvos = document.getElementById('lista-salvos');
const avisoBusca = document.getElementById('aviso-busca');
const contagemSalvos = document.querySelector('.secao .contagem');
const mensagemVazia = document.getElementById('mensagem-vazia');

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
    <div class="acoes">
      <button class="botao" type="button" data-acao="salvar">Salvar</button>
      <button class="botao secundario" type="button" data-acao="descartar">Descartar</button>
    </div>
  `;

  ficha.querySelector('[data-acao="descartar"]').addEventListener('click', () => {
    ficha.remove();
  });

  ficha.querySelector('[data-acao="salvar"]').addEventListener('click', (evento) => {
    salvarArtigo(artigo, ficha, evento.target);
  });

  return ficha;
}

function criarFichaSalva(artigo) {
  const ficha = document.createElement('article');
  ficha.className = 'ficha-artigo ja-salva';
  ficha.dataset.id = artigo.id;

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
    <div class="acoes">
      <form class="remover" method="POST" action="/artigos/${artigo.id}/remover">
        <button class="botao secundario" type="submit">Remover</button>
      </form>
    </div>
  `;

  return ficha;
}

async function buscarArtigos(termo) {
  avisoBusca.textContent = 'Buscando...';
  avisoBusca.classList.remove('erro-texto');
  containerResultados.innerHTML = '';

  try {
    const resposta = await fetch('/api/artigos/buscar?q=' + encodeURIComponent(termo));
    const dados = await resposta.json();

    if (!resposta.ok) {
      avisoBusca.textContent = dados.erro || 'Não foi possível buscar agora.';
      avisoBusca.classList.add('erro-texto');
      return;
    }

    if (dados.resultados.length === 0) {
      avisoBusca.textContent = 'Nenhum resultado encontrado para "' + termo + '".';
      return;
    }

    avisoBusca.textContent = dados.resultados.length + ' resultado(s) encontrado(s).';
    dados.resultados.forEach((artigo) => {
      containerResultados.appendChild(criarFichaResultado(artigo));
    });
  } catch (erro) {
    avisoBusca.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
    avisoBusca.classList.add('erro-texto');
  }
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

    containerSalvos.prepend(criarFichaSalva(dados.artigo));
    atualizarContagem(1);
    if (mensagemVazia) mensagemVazia.style.display = 'none';

    botao.textContent = 'Salvo ✓';
    ficha.classList.add('ja-salva');
    ficha.querySelector('[data-acao="descartar"]').remove();
  } catch (erro) {
    window.alert('Erro de conexão ao salvar o artigo.');
    botao.disabled = false;
    botao.textContent = 'Salvar';
  }
}

function atualizarContagem(delta) {
  if (!contagemSalvos) return;
  const atual = Number.parseInt(contagemSalvos.textContent, 10) || 0;
  contagemSalvos.textContent = (atual + delta) + ' item(ns)';
}

formBusca.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const termo = campoBusca.value.trim();
  if (termo) buscarArtigos(termo);
});
