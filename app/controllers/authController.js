const bcrypt = require('bcryptjs');
const store = require('../models/store');
const { nowIso } = require('../services/dateUtils');

const loginAttempts = new Map();

exports.showLanding = (req, res) => res.render('landing');
exports.showLogin = (req, res) => res.render('auth/login', { error: null });
exports.showRegister = (req, res) => res.render('auth/register', { error: null });

exports.register = (req, res) => {
  try {
    const b = req.body;
    if (!['establishment', 'organization'].includes(b.role)) throw new Error('Selecione um perfil válido.');
    const required = [b.name,b.email,b.password,b.institutionName,b.city,b.neighborhood,b.address,b.phone,b.responsible];
    if (required.some(v => !String(v || '').trim()) || String(b.password).length < 8) {
      throw new Error('Preencha todos os campos obrigatórios e use uma senha com 8 caracteres.');
    }
    const email = String(b.email).trim().toLowerCase();
    if (store.findUserByEmail(email)) throw new Error('Este e-mail já está cadastrado.');
    const user = store.addUser({
      name: String(b.name).trim(),
      email,
      password_hash: bcrypt.hashSync(String(b.password), 12),
      role: b.role,
      active: true,
      created_at: nowIso()
    });
    if (b.role === 'establishment' || b.role === 'organization') {
      store.addInstitution({
        user_id: user.id,
        name: b.institutionName.trim(),
        city: b.city.trim(),
        neighborhood: b.neighborhood.trim(),
        address: b.address.trim(),
        phone: b.phone.trim(),
        responsible: b.responsible.trim(),
        accepted_types: b.acceptedTypes?.trim() || null,
        capacity: b.capacity?.trim() || null,
        transport: b.transport?.trim() || null,
        storage: b.storage?.trim() || null,
        receiving_hours: b.receivingHours?.trim() || null
      });
    }
    req.session.flash = 'Cadastro realizado. Entre com seu e-mail e senha.';
    res.redirect('/login');
  } catch (error) {
    res.status(400).render('auth/register', { error: error.message });
  }
};

exports.login = (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const key = `${req.ip}:${email}`;
  const attempts = loginAttempts.get(key) || { count: 0, until: 0 };
  if (attempts.until > Date.now()) return res.status(429).render('auth/login', { error: 'Muitas tentativas. Aguarde alguns minutos.' });

  const user = store.findUserByEmail(email);
  if (!user || !user.active || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    attempts.count += 1;
    if (attempts.count >= 5) attempts.until = Date.now() + 10 * 60 * 1000;
    loginAttempts.set(key, attempts);
    return res.status(401).render('auth/login', { error: 'E-mail, senha ou conta inválidos.' });
  }
  loginAttempts.delete(key);
  req.session.regenerate(err => {
    if (err) return res.status(500).render('errors/500', { title: 'Erro interno', error: null });
    req.session.userId = user.id;
    req.session.role = user.role;
    req.session.userName = user.name;
    req.session.flash = 'Login realizado com sucesso.';
    res.redirect(user.role === 'establishment' ? '/estabelecimento' : user.role === 'organization' ? '/organizacao' : '/admin');
  });
};

exports.logout = (req, res) => req.session.destroy(() => res.redirect('/'));
