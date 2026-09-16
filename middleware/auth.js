// Bloqueia o acesso a paginas que exigem login.
// Se nao houver usuario na sessao, manda para a tela de login.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Usado nas paginas de login/cadastro: se o usuario ja estiver logado,
// nao faz sentido mostrar essas telas de novo.
function redirectIfLoggedIn(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, redirectIfLoggedIn };
