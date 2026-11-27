const crypto = require('crypto');

const db = require('../models/db');

function csrf(req, res, next) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.body?.csrfToken !== req.session.csrfToken) return res.status(403).render('errors/403', { title: 'Acesso negado' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  const user = db.prepare('SELECT active,role FROM users WHERE id=?').get(req.session.userId);
  if (!user || !user.active) {
    return req.session.destroy(() => res.status(403).render('errors/403', { title: 'Conta desativada' }));
  }
  req.session.role = user.role;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.userId || !roles.includes(req.session.role)) {
      return res.status(403).render('errors/403', { title: 'Acesso negado' });
    }
    next();
  };
}

module.exports = { csrf, requireAuth, requireRole };
