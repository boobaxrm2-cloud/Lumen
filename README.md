# Fichário — ferramenta de apoio à pesquisa acadêmica

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

## Estrutura do projeto

```
server.js          ponto de entrada: configura o Express, sessão e rotas
db/
  index.js         abre/cria o arquivo do banco (data/pesquisa.db) e aplica o schema
  schema.sql        definição das tabelas
  users.js          funções para ler/criar usuários
routes/
  auth.js           rotas de /cadastro, /login, /logout
middleware/
  auth.js           protege páginas que exigem login
views/              páginas HTML (templates EJS)
public/             CSS e JavaScript do navegador
data/               arquivo do banco SQLite (gerado automaticamente, não vai pro git)
```

## Identidade visual

Conceito de "catálogo de biblioteca / fichário de pesquisa": tons terrosos (kraft,
verde escuro, marrom, vermelho-tijolo), título em serifada (Lora) e interface em
sans-serif técnica (IBM Plex Sans). As definições de cor/fonte ficam em
`public/css/style.css`.

## Status atual

- [x] 1. Base do projeto: Express + SQLite, cadastro/login, página inicial protegida
- [ ] 2. Busca de artigos científicos (Semantic Scholar)
- [ ] 3. Leitura de PDF com destaque de trechos
- [ ] 4. Codificação qualitativa de texto

## Segurança e limites conhecidos (ok para uso local/grupo pequeno)

- As sessões ficam em memória: se o servidor reiniciar, todo mundo precisa logar de
  novo. Perfeitamente aceitável para uso local; se um dia isso for hospedado para
  acesso externo, vale trocar por um "session store" persistente.
- Não existe "esqueci minha senha" — combinado no pedido original, fica para depois.
