const en = require('../locales/en.json');
const pt = require('../locales/pt.json');
const es = require('../locales/es.json');
const ko = require('../locales/ko.json');

const DICIONARIOS = { en, pt, es, ko };
const IDIOMA_PADRAO = 'en';
const IDIOMAS_SUPORTADOS = ['en', 'pt', 'es', 'ko'];

const LOCALE_POR_IDIOMA = { en: 'en-US', pt: 'pt-BR', es: 'es-ES', ko: 'ko-KR' };
const CSV_DELIMITADOR_POR_IDIOMA = { en: ',', pt: ';', es: ';', ko: ',' };

function idiomaValido(valor) {
  return IDIOMAS_SUPORTADOS.includes(valor) ? valor : IDIOMA_PADRAO;
}

function t(idioma, chave, params = {}) {
  const dicionario = DICIONARIOS[idioma] || DICIONARIOS[IDIOMA_PADRAO];
  let texto = dicionario[chave] ?? DICIONARIOS[IDIOMA_PADRAO][chave] ?? chave;
  for (const [nome, valor] of Object.entries(params)) {
    texto = texto.replaceAll(`{${nome}}`, String(valor));
  }
  return texto;
}

module.exports = {
  t,
  idiomaValido,
  IDIOMAS_SUPORTADOS,
  IDIOMA_PADRAO,
  LOCALE_POR_IDIOMA,
  CSV_DELIMITADOR_POR_IDIOMA,
};
