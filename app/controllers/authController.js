const bcrypt = require('bcryptjs');
const db = require('../models/db');
const { nowIso } = require('../services/dateUtils');

const loginAttempts = new Map();

exports.showLanding = (req, res) => res.render('landing');
exports.showLogin = (req, res) => res.render('auth/login', { error: null });
exports.showRegister = (req, res) => res.render('auth/register', { error: null });

exports.register = (req, res, next) => {
  try {
    const b = req.body;
    if (!['establishment', 'organization'].includes(b.role)) throw new Error('Selecione um perfil válido.');
    const required = [b.name,b.email,b.password,b.institutionName,b.city,b.neighborhood,b.address,b.phone,b.responsible];
    if (required.some(v => !String(v || '').trim()) || String(b.password).length < 8) throw new Error('Preencha todos os campos obrigatórios e use uma senha com 8 caracteres.');
    const email = String(b.email).trim().toLowerCase();
    const tx = db.transaction(() => {
      const result = db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
        .run(String(b.name).trim(), email, bcrypt.hashSync(String(b.password), 12), b.role, nowIso());
      db.prepare(`INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible,accepted_types,capacity,transport,storage,receiving_hours)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(result.lastInsertRowid, b.institutionName.trim(), b.city.trim(), b.neighborhood.trim(), b.address.trim(), b.phone.trim(), b.responsible.trim(),
        b.acceptedTypes?.trim() || null, b.capacity?.trim() || null, b.transport?.trim() || null, b.storage?.trim() || null, b.receivingHours?.trim() || null);
    });
    tx();
    req.session.flash = 'Cadastro realizado. Entre com seu e-mail e senha.';
    res.redirect('/login');
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) error = new Error('Este e-mail já está cadastrado.');
    res.status(400).render('auth/register', { error: error.message });
  }
};

exports.login = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const key = `${req.ip}:${email}`;
  const attempts = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempts.until > Date.now()) return res.status(429).render('auth/login', { error: 'Muitas tentativas. Aguarde alguns minutos.' });
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!user || !user.active || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    attempts.count += 1;
    if (attempts.count >= 5) attempts.until = Date.now() + 10 * 60 * 1000;
    loginAttempts.set(key, attempts);
    return res.status(401).render('auth/login', { error: 'E-mail, senha ou conta inválidos.' });
  }
  loginAttempts.delete(key);
  req.session.regenerate(err => {
    if (err) throw err;
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userName = user.name;
    req.session.flash = 'Login realizado com sucesso.';
    res.redirect(user.role === 'establishment' ? '/estabelecimento' : user.role === 'organization' ? '/organizacao' : '/admin');
  });
};

exports.logout = (req, res) => req.session.destroy(() => res.redirect('/'));
