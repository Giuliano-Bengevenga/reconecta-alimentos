const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../app/models/db');
const business = require('../app/services/business');

function reset() {
  db.exec("DELETE FROM status_history; DELETE FROM requests; DELETE FROM offers; DELETE FROM institutions; DELETE FROM users;");
}

function fixture() {
  reset();
  const password=bcrypt.hashSync('12345678',12);
  const est=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
    .run('Doador','doador@teste.test',password,'establishment',new Date().toISOString());
  const estInst=db.prepare('INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible) VALUES(?,?,?,?,?,?,?)')
    .run(est.lastInsertRowid,'Padaria Teste','Campinas','Centro','Rua 1','123','Pessoa');
  const org=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
    .run('Organização','org@teste.test',password,'organization',new Date().toISOString());
  const orgInst=db.prepare('INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible) VALUES(?,?,?,?,?,?,?)')
    .run(org.lastInsertRowid,'Org Teste','Campinas','Centro','Rua 2','456','Pessoa');
  const future=new Date(Date.now()+24*60*60*1000).toISOString();
  const offer=db.prepare(`INSERT INTO offers(establishment_id,name,description,category,quantity,unit,conservation,deadline,city,neighborhood,pickup_instructions,status,published_at,eligible,eligibility_reason)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(estInst.lastInsertRowid,'Pães','Pães do dia','Pães',10,'unidades','Ambiente',future,'Campinas','Centro','Na recepção','Disponível',new Date().toISOString(),1,'Elegível');
  return {est:est.lastInsertRowid,estInst:estInst.lastInsertRowid,org:org.lastInsertRowid,orgInst:orgInst.lastInsertRowid,offer:offer.lastInsertRowid};
}

test('estabelecimento não altera oferta de outro estabelecimento',()=>{
  const f=fixture();
  const other=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
    .run('Outro','outro@teste.test',bcrypt.hashSync('12345678',12),'establishment',new Date().toISOString());
  const inst=db.prepare('INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible) VALUES(?,?,?,?,?,?,?)')
    .run(other.lastInsertRowid,'Outro','Campinas','Centro','Rua','1','Pessoa');
  assert.throws(()=>business.confirmRequest(other.lastInsertRowid,999),'Solicitação inexistente');
});

test('organização não executa ação de estabelecimento',()=>{
  const f=fixture();
  business.requestOffer(f.org,f.offer);
  const request=db.prepare('SELECT id FROM requests WHERE offer_id=?').get(f.offer);
  assert.throws(()=>business.confirmRequest(f.org,request.id),'A organização não é estabelecimento');
});

test('não confirma duas reservas para a mesma oferta',()=>{
  const f=fixture();
  business.requestOffer(f.org,f.offer);
  const r1=db.prepare('SELECT id FROM requests WHERE offer_id=?').get(f.offer);
  const org2=db.prepare('INSERT INTO users(name,email,password_hash,role,active,created_at) VALUES(?,?,?,?,1,?)')
    .run('Org 2','org2@teste.test',bcrypt.hashSync('12345678',12),'organization',new Date().toISOString());
  const inst2=db.prepare('INSERT INTO institutions(user_id,name,city,neighborhood,address,phone,responsible) VALUES(?,?,?,?,?,?,?)')
    .run(org2.lastInsertRowid,'Org 2','Campinas','Centro','Rua','1','Pessoa');
  business.requestOffer(org2.lastInsertRowid,f.offer);
  business.confirmRequest(f.est,r1.id);
  const r2=db.prepare('SELECT id FROM requests WHERE offer_id=? AND organization_id=?').get(f.offer,inst2.lastInsertRowid);
  assert.throws(()=>business.confirmRequest(f.est,r2.id),'Reserva dupla deve ser bloqueada');
  assert.equal(db.prepare("SELECT COUNT(*) count FROM requests WHERE offer_id=? AND status='Confirmada'").get(f.offer).count,1);
});

test('não reserva após o prazo',()=>{
  const f=fixture();
  db.prepare("UPDATE offers SET deadline=? WHERE id=?").run(new Date(Date.now()-60000).toISOString(),f.offer);
  assert.throws(()=>business.requestOffer(f.org,f.offer),'Prazo vencido');
});

test('cancelamento mantém histórico e devolve oferta',()=>{
  const f=fixture();
  business.requestOffer(f.org,f.offer);
  const r=db.prepare('SELECT id FROM requests WHERE offer_id=?').get(f.offer);
  business.confirmRequest(f.est,r.id);
  business.cancelRequest(f.est,r.id,'Problema de transporte');
  assert.equal(db.prepare('SELECT status FROM offers WHERE id=?').get(f.offer).status,'Disponível');
  assert.ok(db.prepare("SELECT COUNT(*) count FROM status_history WHERE entity_type='request' AND to_status='Cancelada'").get().count>=1);
});

test('conclusão exige entrega do estabelecimento',()=>{
  const f=fixture();
  business.requestOffer(f.org,f.offer);
  const r=db.prepare('SELECT id FROM requests WHERE offer_id=?').get(f.offer);
  business.confirmRequest(f.est,r.id);
  assert.throws(()=>business.confirmReceipt(f.org,r.id),'Recebimento sem entrega');
});

test('métricas separam unidades',()=>{
  const f=fixture();
  business.requestOffer(f.org,f.offer);
  const r=db.prepare('SELECT id FROM requests WHERE offer_id=?').get(f.offer);
  business.confirmRequest(f.est,r.id);
  db.prepare("UPDATE requests SET actual_pickup_at=?,delivered_quantity=?,organization_confirmed_at=?,within_deadline=1,status='Concluída' WHERE id=?")
    .run(new Date().toISOString(),10,new Date().toISOString(),r.id);
  db.prepare("UPDATE offers SET status='Concluída' WHERE id=?").run(f.offer);
  const units=db.prepare("SELECT unit,SUM(delivered_quantity) total FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.status='Concluída' GROUP BY unit").all();
  assert.equal(units[0].unit,'unidades');
  assert.equal(units[0].total,10);
});
