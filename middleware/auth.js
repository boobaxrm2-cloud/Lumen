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

// Protege as paginas do painel de admin. O admin loga pela mesma tela de
// login de todo mundo - so quem tem o email configurado em ADMIN_EMAIL
// recebe a flag isAdmin na sessao (ver routes/auth.js).
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  if (!req.session.isAdmin) {
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, redirectIfLoggedIn, requireAdmin };
