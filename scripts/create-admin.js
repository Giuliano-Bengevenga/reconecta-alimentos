const bcrypt = require('bcryptjs');
const db = require('../app/models/db');
const { nowIso } = require('../app/services/dateUtils');
const [name,email,password] = process.argv.slice(2);
if (!name || !email || !password || password.length < 8) {
  console.error('Uso: npm run create-admin -- "Nome" "admin@exemplo.com" "senha-com-8-caracteres"');
  process.exit(1);
}
try {
  db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
    .run(name,email.trim().toLowerCase(),bcrypt.hashSync(password,12),'admin',nowIso());
  console.log('Administrador criado.');
} catch (error) {
  if (String(error.message).includes('UNIQUE')) console.error('Este e-mail já está cadastrado.');
  else throw error;
}
