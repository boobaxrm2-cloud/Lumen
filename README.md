# Lumen — ferramenta de apoio à pesquisa acadêmica

Aplicação web para ajudar pesquisadores a: buscar artigos científicos, ler/analisar PDFs
e codificar dados qualitativos. Sem IA — tudo funciona com regras, busca de texto e
APIs públicas de artigos.

Cada pesquisador tem sua própria conta e só vê seus próprios artigos, destaques e
códigos.

## Stack

- **Backend:** Node.js + Express
- **Banco de dados:** SQLite, usando o módulo `node:sqlite` já embutido no Node.js
  (não precisa instalar nada nativo nem um servidor de banco separado)
- **Login:** email + senha, hash com bcrypt, sessão via cookie (`express-session`)
- **Frontend:** HTML renderizado pelo servidor (EJS) + CSS/JS simples

## Como rodar localmente

Pré-requisito: Node.js 22.5 ou mais novo instalado (`node -v` para conferir).

```bash
npm install
npm start
```

Depois abra http://localhost:3000 no navegador. Ele vai te levar para a tela de login;
clique em "Cadastre-se" para criar a primeira conta.

O arquivo `.env` já existe com uma chave de sessão gerada aleatoriamente. Se quiser
gerar uma nova, veja o exemplo em `.env.example`.

Sua conta e seus dados ficam em `data/pesquisa.db` e não são apagados entre
atualizações do código — você não precisa recriar a conta a cada mudança. Se algum
dia quiser mesmo começar do zero, é só apagar esse arquivo (o servidor recria um banco
vazio na próxima vez que rodar).

## Estrutura do projeto

```
server.js          ponto de entrada: configura o Express, sessão e rotas
db/
  index.js         abre/cria o arquivo do banco (data/pesquisa.db) e aplica o schema
  schema.sql        definição das tabelas
  users.js          funções para ler/criar usuários
  articles.js       funções para os artigos salvos
  documents.js      funções para os PDFs enviados (documentos)
  highlights.js     funções para os trechos-chave marcados
routes/
  auth.js           rotas de /cadastro, /login, /logout
  articles.js       rotas de busca/salvar/remover artigos
  reading.js        rotas de upload de documento e marcação de trechos-chave
middleware/
  auth.js           protege páginas que exigem login
views/              páginas HTML (templates EJS)
public/             CSS e JavaScript do navegador
data/               arquivo do banco SQLite (gerado automaticamente, não vai pro git)
```

## Identidade visual

Tema escuro (navy) com destaque dourado. Títulos e interface usam a mesma fonte
(IBM Plex Sans), títulos em negrito. As definições de cor/fonte ficam no `:root`
de `public/css/style.css` — trocar a paleta é so mudar essas variáveis ali.

As fotos em `public/images/` são do banco gratuito Unsplash (Unsplash License,
uso livre sem exigir atribuição): foto de mesa/escritório por Zoshua Colah, foto
de lupa sobre livro por Coppertist Wu, e foto de página aberta por Simran Sood.

## Status atual

- [x] 1. Base do projeto: Express + SQLite, cadastro/login, página inicial protegida
- [x] 1.1. Página "Minha conta" (`/conta`, acessada pelo menu no nome do usuário no
      cabeçalho) para editar nome e trocar senha
- [x] 2. Busca de artigos científicos (Semantic Scholar), salvar com detecção de
      duplicidade (DOI ou título parecido), remover e exportar CSV
- [x] 3. Leitura de PDF: extração de texto no navegador, busca com destaque no
      texto, marcação de trechos-chave salvos por documento
- [ ] 4. Codificação qualitativa de texto

## Sobre a busca de artigos (módulo 2)

- A busca usa a API pública do Semantic Scholar
  (`https://api.semanticscholar.org/graph/v1/paper/search`). Sem chave de API, esse
  limite é **compartilhado com qualquer pessoa no mundo** usando a API sem chave — por
  isso a mensagem "Muitas buscas em pouco tempo" pode aparecer, mesmo você tendo feito
  poucas buscas.
- **Para reduzir isso:** peça uma chave gratuita em
  https://www.semanticscholar.org/product/api#api-key-form (é um formulário simples,
  aprovação por email). Depois, adicione a chave recebida no arquivo `.env`:
  ```
  SEMANTIC_SCHOLAR_API_KEY=sua-chave-aqui
  ```
  Reinicie o servidor (`npm start`) e pronto — o código já está preparado para usar a
  chave automaticamente quando ela existir, sem chave continua funcionando do mesmo jeito
  (só com o limite compartilhado).
- Ao clicar em "Salvar", o backend verifica se você já salvou algo com o mesmo DOI ou com
  título muito parecido (comparando as palavras do título). Se encontrar, mostra um aviso
  perguntando se quer salvar mesmo assim.
- Cada busca traz 100 resultados (o máximo que a API permite por chamada); o botão
  "Carregar mais resultados" busca a próxima leva (a Semantic Scholar informa quantos
  resultados existem no total).
- Quando a Semantic Scholar sabe de uma cópia em acesso aberto (legal e gratuita) do
  artigo, aparecem os links "Pré-visualizar PDF" e "Baixar PDF". Isso só existe pra
  artigos de acesso aberto — não tentamos contornar paywall de artigos pagos.
- Os artigos salvos ficam na página **Biblioteca** (`/biblioteca`), separada da busca.
  De lá dá pra exportar CSV (agora incluindo a coluna do PDF de acesso aberto) ou
  remover itens.

## Sobre a leitura de PDF (módulo 3)

- O PDF é enviado e **guardado no servidor** (pasta `uploads/<id-do-usuário>/`,
  fora do controle de versão — veja `.gitignore`). Isso permite reabrir
  ("Visualizar") ou baixar o arquivo depois, sem precisar reenviar. O texto
  ainda é extraído no navegador (PDF.js) toda vez que o PDF é aberto — o
  servidor só guarda os bytes do arquivo, não faz nada com o conteúdo.
- Documentos enviados **antes** dessa funcionalidade existir não têm arquivo
  guardado (`file_path` vazio no banco); "Visualizar"/"Baixar" avisam pra
  reenviar o PDF nesse caso.
- Cada página é desenhada exatamente como no PDF original (mesma formatação,
  colunas, negrito etc.) — por baixo, existe uma camada de texto invisível na
  mesma posição, que é o que permite selecionar um trecho com o mouse.
- **As páginas são mostradas uma de cada vez** (com botões "Anterior"/"Próxima"),
  não o documento inteiro de uma vez. Isso evita que o navegador role a tela
  sozinho no meio de uma seleção de texto em documentos longos, o que
  bagunçava a seleção antes.
- Ao selecionar um trecho com o mouse, aparece um botão flutuante perto do
  cursor pra marcar aquele trecho como chave — não precisa procurar um botão
  em outra parte da tela.
- A busca destaca a(s) linha(s) inteira(s) onde o termo aparece (em vez de só a
  palavra) e leva automaticamente até a página onde ele está; clicar de novo em
  "Buscar" vai para a próxima ocorrência (em outra página, se for o caso). Em
  PDFs vindos de alguns geradores de currículo/design (Canva e similares), a
  camada de texto às vezes vem malposicionada pelo próprio gerador do PDF —
  nesses casos o destaque pode cair na linha ao lado. Isso é uma limitação do
  PDF de origem, não depende de nós; PDFs de artigos acadêmicos (gerados por
  Word, LaTeX, sistemas de editoras) normalmente não têm esse problema.
- PDFs de páginas escaneadas como imagem (sem texto selecionável) não têm texto
  para extrair — o app avisa quando isso acontece.
- Você pode, opcionalmente, vincular o PDF a um artigo já salvo no módulo de busca.

## Segurança e limites conhecidos (ok para uso local/grupo pequeno)

- As sessões ficam em memória: se o servidor reiniciar, todo mundo precisa logar de
  novo. Perfeitamente aceitável para uso local; se um dia isso for hospedado para
  acesso externo, vale trocar por um "session store" persistente.
- Não existe "esqueci minha senha" — combinado no pedido original, fica para depois.
- PDFs enviados ficam guardados em `uploads/` (limite de 30 MB por arquivo). Isso
  cresce com o tempo — se um dia isso for hospedado, vale de vez em quando checar o
  tamanho da pasta e conversar com quem usa sobre limpar documentos antigos.
  Lembrando também (já falamos disso antes): o jeito que o Bebrave18 é hospedado na
  Hostinger hoje (deploy via Git) apaga arquivos locais a cada deploy — se o Lumen for
  hospedado do mesmo jeito, a pasta `uploads/` seria apagada a cada atualização de
  código. Antes de hospedar, vale revisitar essa conversa.
