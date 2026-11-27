process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const store = require('../app/models/store');
const business = require('../app/services/business');
const adminController = require('../app/controllers/adminController');
const app = require('../app');

function resetScenario() {
  store.resetDemoData();
  store.requests.length = 0;
  store.statusHistory.length = 0;
  const establishmentUser = store.findUserByEmail('padaria@demo.local');
  const organizationUser = store.findUserByEmail('ong@demo.local');
  const establishment = store.institutionForUser(establishmentUser.id);
  const organization = store.institutionForUser(organizationUser.id);
  return { establishmentUser, organizationUser, establishment, organization, offer: store.offers[0] };
}

function createOrganization(email, name) {
  const user = store.addUser({
    name,
    email,
    password_hash: bcrypt.hashSync('demo1234', 10),
    role: 'organization',
    active: true,
    created_at: new Date().toISOString()
  });
  const institution = store.addInstitution({
    user_id: user.id,
    name,
    city: 'Campinas',
    neighborhood: 'Centro',
    address: 'Endereço de teste',
    phone: '123',
    responsible: name
  });
  return { user, institution };
}

test('estabelecimento não altera solicitação de oferta alheia', () => {
  const f = resetScenario();
  const outsider = store.addUser({
    name: 'Outro doador',
    email: 'outro@demo.local',
    password_hash: bcrypt.hashSync('demo1234', 10),
    role: 'establishment',
    active: true,
    created_at: new Date().toISOString()
  });
  store.addInstitution({ user_id: outsider.id, name: 'Outro estabelecimento' });
  const request = business.requestOffer(f.organizationUser.id, f.offer.id);
  assert.throws(() => business.confirmRequest(outsider.id, request.id), /Você não pode confirmar/);
});

test('organização não executa ação de estabelecimento', () => {
  const f = resetScenario();
  const request = business.requestOffer(f.organizationUser.id, f.offer.id);
  assert.throws(() => business.confirmRequest(f.organizationUser.id, request.id), /Você não pode confirmar/);
});

test('apenas uma solicitação pode ser confirmada para cada oferta', () => {
  const f = resetScenario();
  const request1 = business.requestOffer(f.organizationUser.id, f.offer.id);
  const organization2 = createOrganization('ong2@demo.local', 'Outra organização');
  const request2 = business.requestOffer(organization2.user.id, f.offer.id);
  business.confirmRequest(f.establishmentUser.id, request1.id);
  assert.throws(() => business.confirmRequest(f.establishmentUser.id, request2.id), /não pode mais ser reservada/);
  assert.equal(store.requests.filter(item => item.offer_id === f.offer.id && item.status === 'Confirmada').length,1);
});

test('não permite solicitar oferta após o prazo', () => {
  const f = resetScenario();
  f.offer.deadline = new Date(Date.now() - 60000).toISOString();
  assert.throws(() => business.requestOffer(f.organizationUser.id, f.offer.id), /não está mais disponível/);
});

test('cancelamento registra motivo e libera reserva antes do prazo', () => {
  const f = resetScenario();
  const request = business.requestOffer(f.organizationUser.id, f.offer.id);
  business.confirmRequest(f.establishmentUser.id, request.id);
  business.cancelRequest(f.establishmentUser.id, request.id, 'Problema de transporte');
  assert.equal(f.offer.status,'Disponível');
  assert.equal(request.status,'Cancelada');
  assert.ok(store.statusHistory.some(item => item.entity_type === 'request' && item.to_status === 'Cancelada' && item.reason === 'Problema de transporte'));
});

test('conclusão exige registro de entrega do estabelecimento', () => {
  const f = resetScenario();
  const request = business.requestOffer(f.organizationUser.id, f.offer.id);
  business.confirmRequest(f.establishmentUser.id, request.id);
  assert.throws(() => business.confirmReceipt(f.organizationUser.id, request.id), /entrega ainda não foi registrada/);
});

test('métricas separam unidades e usam somente elegíveis com prazo encerrado', () => {
  const f = resetScenario();
  const completed = business.requestOffer(f.organizationUser.id, f.offer.id);
  business.confirmRequest(f.establishmentUser.id, completed.id);
  business.registerDelivery(f.establishmentUser.id, completed.id, new Date().toISOString(), 10);
  business.confirmReceipt(f.organizationUser.id, completed.id);
  f.offer.eligible = true;
  f.offer.deadline = new Date(Date.now() - 1000).toISOString();
  store.addOffer({
    ...f.offer,
    name:'Oferta elegível ainda em prazo',
    status:'Disponível',
    deadline:new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  const metrics = adminController.calculateMetrics();
  assert.equal(metrics.denominator,1);
  assert.equal(metrics.success,'100.0%');
  assert.equal(metrics.units.find(item => item.unit === 'unidades').total,10);
});

test('cadastro público não cria administrador', async () => {
  resetScenario();
  const agent = request.agent(app);
  const form = await agent.get('/cadastro');
  const csrfToken = form.text.match(/name="csrfToken" value="([^"]+)"/)[1];
  const response = await agent.post('/cadastro').type('form').send({
    csrfToken,role:'admin',name:'Admin',email:'admin-new@demo.local',password:'demo1234',
    institutionName:'Instituição',city:'Campinas',neighborhood:'Centro',address:'Rua',
    phone:'123',responsible:'Responsável'
  });
  assert.equal(response.status,400);
  assert.equal(store.findUserByEmail('admin-new@demo.local'),null);
});

test('acesso demonstrativo do estabelecimento abre o painel', async () => {
  resetScenario();
  const agent = request.agent(app);
  const loginPage = await agent.get('/login');
  const csrfToken = loginPage.text.match(/name="csrfToken" value="([^"]+)"/)[1];
  const response = await agent.post('/login').type('form').send({
    csrfToken,
    email:'padaria@demo.local',
    password:'demo1234'
  });
  assert.equal(response.status,302);
  const dashboard = await agent.get('/estabelecimento');
  assert.equal(dashboard.status,200);
  assert.match(dashboard.text,/Modo demonstração/);
});

test('cookie de sessão seguro funciona atrás do proxy HTTPS do Render', () => {
  const script = `
    const assert = require('node:assert/strict');
    const app = require('./app');
    require('supertest')(app).get('/login').set('x-forwarded-proto','https').then(response => {
      assert.equal(response.status,200);
      assert.ok(response.headers['set-cookie'][0].includes('; Secure;'));
    }).catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
  `;
  execFileSync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production', SESSION_SECRET: 'test-secret-only' },
    stdio: 'pipe'
  });
});
