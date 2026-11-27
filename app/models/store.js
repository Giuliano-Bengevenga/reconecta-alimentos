const bcrypt = require('bcryptjs');
const { nowIso } = require('../services/dateUtils');

const store = {
  users: [],
  institutions: [],
  offers: [],
  requests: [],
  statusHistory: [],
  nextUserId: 1,
  nextInstitutionId: 1,
  nextOfferId: 1,
  nextRequestId: 1,
  nextHistoryId: 1,
  resetDemoData,
  addUser,
  addInstitution,
  findUserByEmail,
  findUserById,
  institutionForUser,
  updateInstitution,
  addOffer,
  updateOffer,
  offerForEstablishment,
  offerWithInstitution,
  requestsForOffer,
  requestsForOrganization,
  recordStatus
};

function resetDemoData() {
  store.users.length = 0;
  store.institutions.length = 0;
  store.offers.length = 0;
  store.requests.length = 0;
  store.statusHistory.length = 0;
  store.nextUserId = 1;
  store.nextInstitutionId = 1;
  store.nextOfferId = 1;
  store.nextRequestId = 1;
  store.nextHistoryId = 1;
  const passwordHash = bcrypt.hashSync('demo1234', 10);
  const demoUsers = [
    { name: 'Equipe da Padaria', email: 'padaria@demo.local', role: 'establishment', institutionName: 'Padaria Demonstração' },
    { name: 'Equipe da Organização', email: 'ong@demo.local', role: 'organization', institutionName: 'Organização Demonstração' },
    { name: 'Administração', email: 'admin@demo.local', role: 'admin', institutionName: null }
  ];

  for (const demo of demoUsers) {
    const user = addUser({
      name: demo.name,
      email: demo.email,
      password_hash: passwordHash,
      role: demo.role,
      active: true,
      created_at: nowIso()
    });
    if (demo.institutionName) {
      addInstitution({
        user_id: user.id,
        name: demo.institutionName,
        city: 'Campinas',
        neighborhood: demo.role === 'establishment' ? 'Centro' : 'Cambuí',
        address: 'Endereço fictício para demonstração',
        phone: '(19) 90000-0000',
        responsible: demo.name,
        accepted_types: demo.role === 'organization' ? 'Pães e frutas' : null,
        capacity: demo.role === 'organization' ? 'Até 20 kg' : null,
        transport: demo.role === 'organization' ? 'A combinar' : null,
        storage: demo.role === 'organization' ? 'Refrigeração disponível' : null,
        receiving_hours: demo.role === 'organization' ? 'Dias úteis, 9h às 17h' : null
      });
    }
  }

  const establishment = store.institutions.find(item => item.user_id === store.users[0].id);
  const organization = store.institutions.find(item => item.user_id === store.users[1].id);
  const offer = addOffer({
    establishment_id: establishment.id,
    name: 'Pães do dia (demonstração)',
    description: 'Exemplo fictício para conhecer o fluxo de ofertas.',
    category: 'Pães',
    quantity: 15,
    unit: 'unidades',
    conservation: 'Temperatura ambiente',
    expiration_info: 'Informação ilustrativa do doador',
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    city: 'Campinas',
    neighborhood: 'Centro',
    pickup_instructions: 'Instruções fictícias de retirada.',
    status: 'Disponível',
    published_at: nowIso(),
    eligible: false,
    eligibility_reason: 'Oferta de demonstração; não integra os indicadores do piloto'
  });
  recordStatus('offer', offer.id, null, 'Disponível', establishment.user_id, 'Oferta fictícia de demonstração');

  const request = {
    id: store.nextRequestId++,
    offer_id: offer.id,
    organization_id: organization.id,
    status: 'Pendente',
    reason: null,
    created_at: nowIso(),
    establishment_confirmed_at: null,
    organization_confirmed_at: null,
    actual_pickup_at: null,
    delivered_quantity: null,
    within_deadline: null
  };
  store.requests.push(request);
  recordStatus('request', request.id, null, 'Pendente', organization.user_id, 'Solicitação fictícia de demonstração');
}

function addUser(user) {
  const created = { ...user, id: store.nextUserId++ };
  store.users.push(created);
  return created;
}

function addInstitution(institution) {
  const created = { ...institution, id: store.nextInstitutionId++ };
  store.institutions.push(created);
  return created;
}

function findUserByEmail(email) {
  return store.users.find(user => user.email === email) || null;
}

function findUserById(id) {
  return store.users.find(user => user.id === Number(id)) || null;
}

function institutionForUser(userId) {
  return store.institutions.find(institution => institution.user_id === Number(userId)) || null;
}

function updateInstitution(id, fields) {
  const institution = store.institutions.find(item => item.id === Number(id));
  if (!institution) return null;
  Object.assign(institution, fields);
  return institution;
}

function addOffer(offer) {
  const created = { ...offer, id: store.nextOfferId++ };
  store.offers.push(created);
  return created;
}

function updateOffer(id, fields) {
  const offer = store.offers.find(item => item.id === Number(id));
  if (!offer) return null;
  Object.assign(offer, fields);
  return offer;
}

function offerForEstablishment(id, establishmentId) {
  return store.offers.find(offer => offer.id === Number(id) && offer.establishment_id === Number(establishmentId)) || null;
}

function offerWithInstitution(id) {
  const offer = store.offers.find(item => item.id === Number(id));
  if (!offer) return null;
  const institution = store.institutions.find(item => item.id === offer.establishment_id);
  return institution ? { ...offer, institution_name: institution.name, institution_city: institution.city, institution_neighborhood: institution.neighborhood } : null;
}

function requestsForOffer(offerId) {
  return store.requests
    .filter(request => request.offer_id === Number(offerId))
    .map(request => {
      const organization = store.institutions.find(item => item.id === request.organization_id);
      return { ...request, organization_name: organization?.name, address: organization?.address, phone: organization?.phone, responsible: organization?.responsible };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function requestsForOrganization(organizationId) {
  return store.requests
    .filter(request => request.organization_id === Number(organizationId))
    .map(request => {
      const offer = store.offers.find(item => item.id === request.offer_id);
      const establishment = store.institutions.find(item => item.id === offer?.establishment_id);
      return {
        ...request,
        offer_name: offer?.name,
        deadline: offer?.deadline,
        quantity: offer?.quantity,
        unit: offer?.unit,
        offer_status: offer?.status,
        institution_name: establishment?.name
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function recordStatus(entityType, entityId, fromStatus, toStatus, actorUserId, reason) {
  const entry = {
    id: store.nextHistoryId++,
    entity_type: entityType,
    entity_id: Number(entityId),
    from_status: fromStatus,
    to_status: toStatus,
    actor_user_id: actorUserId ? Number(actorUserId) : null,
    reason: reason || null,
    created_at: nowIso()
  };
  store.statusHistory.push(entry);
  return entry;
}

resetDemoData();
module.exports = store;
