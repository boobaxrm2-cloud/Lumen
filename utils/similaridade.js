// Compara titulos de artigos "por palavras", ignorando acentos, maiusculas e pontuacao,
// para avisar quando um artigo parecido ja foi salvo (mesmo que o titulo nao seja identico).

function normalizarTitulo(titulo) {
  return (titulo || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Similaridade de Jaccard: proporcao de palavras em comum entre os dois titulos.
// 1 = titulos com as mesmas palavras, 0 = nenhuma palavra em comum.
function similaridadeTitulos(tituloA, tituloB) {
  const palavrasA = new Set(normalizarTitulo(tituloA));
  const palavrasB = new Set(normalizarTitulo(tituloB));
  if (palavrasA.size === 0 || palavrasB.size === 0) return 0;

  let intersecao = 0;
  for (const palavra of palavrasA) {
    if (palavrasB.has(palavra)) intersecao += 1;
  }
  const uniao = new Set([...palavrasA, ...palavrasB]).size;
  return intersecao / uniao;
}

module.exports = { normalizarTitulo, similaridadeTitulos };
