const bcrypt = require('bcryptjs');
const db = require('../app/models/db');
const { nowIso, localToUtc } = require('../app/services/dateUtils');

const password = bcrypt.hashSync('12345678',12);
const tx=db.transaction(()=>{
  db.prepare('DELETE FROM status_history').run();
  db.prepare('DELETE FROM requests').run();
  db.prepare('DELETE FROM offers').run();
  db.prepare('DELETE FROM institutions').run();
  db.prepare('DELETE FROM users').run();
  for(let i=1;i<=5;i++){
    const r=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
      .run(`Responsável Padaria ${i}`,`padaria${i}@exemplo.test`,password,'establishment',nowIso());
    db.prepare(`INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible) VALUES(?,?,?,?,?,?,?)`)
      .run(r.lastInsertRowid,`Padaria Fictícia ${i}`,'Campinas',i%2?'Centro':'Barão Geraldo','Rua Fictícia '+i,'(19) 99999-000'+i,`Responsável ${i}`);
  }
  for(let i=1;i<=3;i++){
    const r=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
      .run(`Responsável Organização ${i}`,`organizacao${i}@exemplo.test`,password,'organization',nowIso());
    db.prepare(`INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible,accepted_types,capacity,transport,storage,receiving_hours) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(r.lastInsertRowid,`Organização Fictícia ${i}`,'Campinas',i===1?'Cambuí':'Centro','Endereço Fictício '+i,'(19) 98888-000'+i,`Responsável ${i}`,'Pães e frutas','Até 20 kg','Veículo próprio','Geladeira','Dias úteis, 9h às 17h');
  }
  const establishment=db.prepare("SELECT i.* FROM institutions i JOIN users u ON u.id=i.user_id WHERE u.role='establishment' LIMIT 1").get();
  const deadline=localToUtc(new Date(Date.now()+24*60*60*1000).toISOString().slice(0,16));
  db.prepare(`INSERT INTO offers(establishment_id,name,description,category,quantity,unit,conservation,expiration_info,deadline,city,neighborhood,pickup_instructions,status,published_at,eligible,eligibility_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(establishment.id,'Pães do dia','Lote fictício de pães','Pães',15,'unidades','Temperatura ambiente','Consumir no mesmo dia',deadline,'Campinas','Centro','Retirar na recepção','Disponível',nowIso(),1,'Demonstração fictícia');
});
tx();
console.log('Dados fictícios carregados. Senha dos participantes: 12345678');
