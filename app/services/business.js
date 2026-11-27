const store = require('../models/store');
const { nowIso, isPast } = require('./dateUtils');

function institutionForUser(userId) {
  return store.institutionForUser(userId);
}

function history(entityType, entityId) {
  return store.statusHistory
    .filter(entry => entry.entity_type === entityType && entry.entity_id === Number(entityId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function addHistory(entityType, entityId, fromStatus, toStatus, actorId, reason) {
  return store.recordStatus(entityType, entityId, fromStatus, toStatus, actorId, reason);
}

function expireEntities() {
  for (const offer of store.offers) {
    if (!['Disponível','Reservada'].includes(offer.status) || !isPast(offer.deadline)) continue;
    for (const request of store.requests.filter(item => item.offer_id === offer.id && ['Pendente','Confirmada'].includes(item.status))) {
      const previous = request.status;
      request.status = 'Expirada';
      request.reason ||= 'Prazo de retirada ultrapassado';
      if (previous === 'Confirmada') addHistory('request', request.id, previous, 'Expirada', null, request.reason);
    }
    addHistory('offer', offer.id, offer.status, 'Expirada', null, 'Prazo de retirada ultrapassado');
    offer.status = 'Expirada';
  }
}

function requestOffer(organizationUserId, offerId) {
  const organization = institutionForUser(organizationUserId);
  const offer = store.offers.find(item => item.id === Number(offerId));
  if (!organization || !offer) throw new Error('Oferta ou organização não encontrada.');
  if (offer.status !== 'Disponível' || isPast(offer.deadline)) throw new Error('Esta oferta não está mais disponível.');
  const existing = store.requests.find(request =>
    request.offer_id === offer.id &&
    request.organization_id === organization.id &&
    !['Rejeitada','Cancelada','Expirada'].includes(request.status)
  );
  if (existing) throw new Error('Sua organização já possui uma solicitação ativa para esta oferta.');
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
  addHistory('request', request.id, null, 'Pendente', organizationUserId, null);
  return request;
}

function confirmRequest(establishmentUserId, requestId) {
  const request = store.requests.find(item => item.id === Number(requestId));
  const offer = request && store.offers.find(item => item.id === request.offer_id);
  if (!request || !offer) throw new Error('Solicitação não encontrada.');
  const institution = institutionForUser(establishmentUserId);
  if (!institution || institution.id !== offer.establishment_id) throw new Error('Você não pode confirmar esta solicitação.');
  if (offer.status !== 'Disponível' || isPast(offer.deadline)) throw new Error('A oferta não pode mais ser reservada.');
  if (request.status !== 'Pendente') throw new Error('A solicitação não está pendente.');
  if (store.requests.some(item => item.offer_id === offer.id && item.status === 'Confirmada')) {
    throw new Error('Esta oferta já possui uma reserva confirmada.');
  }
  request.status = 'Confirmada';
  request.establishment_confirmed_at = nowIso();
  request.reason = null;
  offer.status = 'Reservada';
  for (const other of store.requests) {
    if (other.offer_id === offer.id && other.id !== request.id && other.status === 'Pendente') {
      other.status = 'Rejeitada';
      other.reason = 'Outra solicitação foi confirmada';
      addHistory('request', other.id, 'Pendente', 'Rejeitada', establishmentUserId, other.reason);
    }
  }
  addHistory('request', request.id, 'Pendente', 'Confirmada', establishmentUserId, null);
  addHistory('offer', offer.id, 'Disponível', 'Reservada', establishmentUserId, null);
}

function cancelRequest(userId, requestId, reason) {
  if (!reason?.trim()) throw new Error('Informe o motivo do cancelamento.');
  const request = store.requests.find(item => item.id === Number(requestId));
  const offer = request && store.offers.find(item => item.id === request.offer_id);
  if (!request || !offer) throw new Error('Solicitação não encontrada.');
  const institution = institutionForUser(userId);
  if (!institution || (institution.id !== request.organization_id && institution.id !== offer.establishment_id)) {
    throw new Error('Você não pode cancelar esta solicitação.');
  }
  if (!['Pendente','Confirmada'].includes(request.status)) throw new Error('Esta solicitação não pode ser cancelada.');
  if (isPast(offer.deadline)) throw new Error('O prazo já encerrou.');
  const oldRequestStatus = request.status;
  const oldOfferStatus = offer.status;
  request.status = 'Cancelada';
  request.reason = reason.trim();
  if (offer.status === 'Reservada') offer.status = 'Disponível';
  addHistory('request', request.id, oldRequestStatus, 'Cancelada', userId, request.reason);
  if (oldOfferStatus === 'Reservada') addHistory('offer', offer.id, 'Reservada', 'Disponível', userId, request.reason);
}

function rejectRequest(establishmentUserId, requestId, reason) {
  if (!reason?.trim()) throw new Error('Informe o motivo da rejeição.');
  const request = store.requests.find(item => item.id === Number(requestId));
  const offer = request && store.offers.find(item => item.id === request.offer_id);
  const institution = institutionForUser(establishmentUserId);
  if (!request || !offer || !institution || institution.id !== offer.establishment_id) {
    throw new Error('Você não pode rejeitar esta solicitação.');
  }
  if (request.status !== 'Pendente' || isPast(offer.deadline)) throw new Error('Esta solicitação não pode ser rejeitada.');
  request.status = 'Rejeitada';
  request.reason = reason.trim();
  addHistory('request', request.id, 'Pendente', 'Rejeitada', establishmentUserId, request.reason);
}

function registerDelivery(establishmentUserId, requestId, actualPickupAt, deliveredQuantity) {
  const request = store.requests.find(item => item.id === Number(requestId));
  const offer = request && store.offers.find(item => item.id === request.offer_id);
  const institution = institutionForUser(establishmentUserId);
  if (!request || !offer || !institution || institution.id !== offer.establishment_id) {
    throw new Error('Você não pode registrar esta entrega.');
  }
  if (request.status !== 'Confirmada') throw new Error('Somente a solicitação confirmada pode receber registros de entrega.');
  if (!actualPickupAt || !Number.isFinite(Number(deliveredQuantity)) || Number(deliveredQuantity) <= 0) {
    throw new Error('Informe a data e uma quantidade entregue válida.');
  }
  request.actual_pickup_at = actualPickupAt;
  request.delivered_quantity = Number(deliveredQuantity);
  addHistory('request', request.id, 'Confirmada', 'Entrega registrada', establishmentUserId, null);
}

function confirmReceipt(organizationUserId, requestId) {
  const request = store.requests.find(item => item.id === Number(requestId));
  const offer = request && store.offers.find(item => item.id === request.offer_id);
  const organization = institutionForUser(organizationUserId);
  if (!request || !offer || !organization || organization.id !== request.organization_id) {
    throw new Error('Você não pode confirmar esta operação.');
  }
  if (request.status !== 'Confirmada' || !request.actual_pickup_at || !request.delivered_quantity) {
    throw new Error('A entrega ainda não foi registrada pelo estabelecimento.');
  }
  request.organization_confirmed_at = nowIso();
  request.within_deadline = new Date(request.actual_pickup_at).getTime() <= new Date(offer.deadline).getTime();
  request.status = 'Concluída';
  offer.status = 'Concluída';
  addHistory('request', request.id, 'Confirmada', 'Concluída', organizationUserId, null);
  addHistory('offer', offer.id, 'Reservada', 'Concluída', organizationUserId, null);
}

module.exports = {
  institutionForUser, history, addHistory, expireEntities, requestOffer,
  confirmRequest, cancelRequest, rejectRequest, registerDelivery, confirmReceipt
};
