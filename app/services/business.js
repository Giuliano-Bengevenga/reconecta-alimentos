const db = require('../models/db');
const { nowIso, isPast } = require('./dateUtils');

function institutionForUser(userId) {
  return db.prepare('SELECT * FROM institutions WHERE user_id = ?').get(userId);
}

function history(entityType, entityId) {
  return db.prepare('SELECT h.*, u.name actor_name FROM status_history h LEFT JOIN users u ON u.id=h.actor_user_id WHERE h.entity_type=? AND h.entity_id=? ORDER BY h.created_at DESC').all(entityType, entityId);
}

function addHistory(entityType, entityId, fromStatus, toStatus, actorId, reason) {
  db.prepare('INSERT INTO status_history(entity_type,entity_id,from_status,to_status,actor_user_id,reason,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(entityType, entityId, fromStatus, toStatus, actorId, reason || null, nowIso());
}

function expireEntities() {
  const offers = db.prepare("SELECT * FROM offers WHERE status IN ('Disponível','Reservada')").all();
  const tx = db.transaction(() => {
    for (const offer of offers) {
      if (isPast(offer.deadline)) {
        if (offer.status === 'Reservada') {
          const confirmed = db.prepare("SELECT * FROM requests WHERE offer_id=? AND status='Confirmada'").get(offer.id);
          if (confirmed) addHistory('request', confirmed.id, confirmed.status, 'Expirada', null, 'Prazo de retirada ultrapassado');
          db.prepare("UPDATE requests SET status='Expirada', reason=COALESCE(reason,'Prazo de retirada ultrapassado') WHERE offer_id=? AND status IN ('Pendente','Confirmada')").run(offer.id);
          addHistory('offer', offer.id, offer.status, 'Expirada', null, 'Prazo de retirada ultrapassado');
        } else {
          db.prepare("UPDATE requests SET status='Expirada', reason=COALESCE(reason,'Prazo de retirada ultrapassado') WHERE offer_id=? AND status='Pendente'").run(offer.id);
          addHistory('offer', offer.id, offer.status, 'Expirada', null, 'Prazo de retirada ultrapassado');
        }
        db.prepare("UPDATE offers SET status='Expirada' WHERE id=?").run(offer.id);
      }
    }
  });
  tx();
}

function requestOffer(organizationUserId, offerId) {
  const org = institutionForUser(organizationUserId);
  const offer = db.prepare('SELECT * FROM offers WHERE id=?').get(offerId);
  if (!org || !offer) throw new Error('Oferta ou organização não encontrada.');
  if (offer.status !== 'Disponível' || isPast(offer.deadline)) throw new Error('Esta oferta não está mais disponível.');
  const existing = db.prepare("SELECT id FROM requests WHERE offer_id=? AND organization_id=? AND status NOT IN ('Rejeitada','Cancelada','Expirada')").get(offerId, org.id);
  if (existing) throw new Error('Sua organização já possui uma solicitação ativa para esta oferta.');
  const tx = db.transaction(() => {
    const result = db.prepare('INSERT INTO requests(offer_id,organization_id,status,created_at) VALUES(?,?,?,?)')
      .run(offerId, org.id, 'Pendente', nowIso());
    addHistory('request', result.lastInsertRowid, null, 'Pendente', organizationUserId, null);
  });
  tx();
}

function confirmRequest(establishmentUserId, requestId) {
  const tx = db.transaction(() => {
    const request = db.prepare('SELECT r.*, o.establishment_id FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.id=?').get(requestId);
    if (!request) throw new Error('Solicitação não encontrada.');
    const institution = institutionForUser(establishmentUserId);
    if (!institution || institution.id !== request.establishment_id) throw new Error('Você não pode confirmar esta solicitação.');
    const offer = db.prepare('SELECT * FROM offers WHERE id=?').get(request.offer_id);
    if (offer.status !== 'Disponível' || isPast(offer.deadline)) throw new Error('A oferta não pode mais ser reservada.');
    if (request.status !== 'Pendente') throw new Error('A solicitação não está pendente.');
    const already = db.prepare("SELECT id FROM requests WHERE offer_id=? AND status='Confirmada'").get(request.offer_id);
    if (already) throw new Error('Esta oferta já possui uma reserva confirmada.');
    db.prepare("UPDATE requests SET status='Confirmada', establishment_confirmed_at=?, reason=NULL WHERE id=?").run(nowIso(), requestId);
    db.prepare("UPDATE offers SET status='Reservada' WHERE id=?").run(request.offer_id);
    db.prepare("UPDATE requests SET status='Rejeitada', reason='Outra solicitação foi confirmada' WHERE offer_id=? AND id<>? AND status='Pendente'").run(request.offer_id, requestId);
    addHistory('request', requestId, 'Pendente', 'Confirmada', establishmentUserId, null);
    addHistory('offer', offer.id, 'Disponível', 'Reservada', establishmentUserId, null);
  });
  tx();
}

function cancelRequest(userId, requestId, reason) {
  if (!reason?.trim()) throw new Error('Informe o motivo do cancelamento.');
  const tx = db.transaction(() => {
    const request = db.prepare('SELECT r.*, o.establishment_id,o.status offer_status,o.deadline FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.id=?').get(requestId);
    if (!request) throw new Error('Solicitação não encontrada.');
    const institution = institutionForUser(userId);
    if (!institution || (institution.id !== request.organization_id && institution.id !== request.establishment_id)) throw new Error('Você não pode cancelar esta solicitação.');
    if (!['Pendente','Confirmada'].includes(request.status)) throw new Error('Esta solicitação não pode ser cancelada.');
    if (isPast(request.deadline)) throw new Error('O prazo já encerrou.');
    db.prepare("UPDATE requests SET status='Cancelada', reason=? WHERE id=?").run(reason.trim(), requestId);
    db.prepare("UPDATE offers SET status='Disponível' WHERE id=? AND status='Reservada'").run(request.offer_id);
    addHistory('request', requestId, request.status, 'Cancelada', userId, reason.trim());
    if (request.offer_status === 'Reservada') addHistory('offer', request.offer_id, 'Reservada', 'Disponível', userId, reason.trim());
  });
  tx();
}

function rejectRequest(establishmentUserId, requestId, reason) {
  if (!reason?.trim()) throw new Error('Informe o motivo da rejeição.');
  const tx = db.transaction(() => {
    const req = db.prepare('SELECT r.*, o.establishment_id,o.deadline FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.id=?').get(requestId);
    const institution = institutionForUser(establishmentUserId);
    if (!req || !institution || institution.id !== req.establishment_id) throw new Error('Você não pode rejeitar esta solicitação.');
    if (req.status !== 'Pendente' || isPast(req.deadline)) throw new Error('Esta solicitação não pode ser rejeitada.');
    db.prepare("UPDATE requests SET status='Rejeitada', reason=? WHERE id=?").run(reason.trim(), req.id);
    addHistory('request', req.id, 'Pendente', 'Rejeitada', establishmentUserId, reason.trim());
  });
  tx();
}

function registerDelivery(establishmentUserId, requestId, actualPickupAt, deliveredQuantity) {
  const tx = db.transaction(() => {
    const req = db.prepare('SELECT r.*, o.establishment_id,o.deadline FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.id=?').get(requestId);
    const institution = institutionForUser(establishmentUserId);
    if (!req || !institution || institution.id !== req.establishment_id) throw new Error('Você não pode registrar esta entrega.');
    if (req.status !== 'Confirmada') throw new Error('Somente a solicitação confirmada pode receber registros de entrega.');
    db.prepare("UPDATE requests SET actual_pickup_at=? , delivered_quantity=? WHERE id=?").run(actualPickupAt, Number(deliveredQuantity), req.id);
    addHistory('request', req.id, 'Confirmada', 'Entrega registrada', establishmentUserId, null);
  });
  tx();
}

function confirmReceipt(orgUserId, requestId) {
  const tx = db.transaction(() => {
    const req = db.prepare('SELECT r.*,o.establishment_id,o.deadline,o.quantity FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.id=?').get(requestId);
    const org = institutionForUser(orgUserId);
    if (!req || !org || org.id !== req.organization_id) throw new Error('Você não pode confirmar esta operação.');
    if (req.status !== 'Confirmada' || !req.actual_pickup_at || !req.delivered_quantity) throw new Error('A entrega ainda não foi registrada pelo estabelecimento.');
    const within = new Date(req.actual_pickup_at).getTime() <= new Date(req.deadline).getTime();
    db.prepare("UPDATE requests SET organization_confirmed_at=?, within_deadline=? WHERE id=?").run(nowIso(), within ? 1 : 0, req.id);
    db.prepare("UPDATE requests SET status='Concluída' WHERE id=?").run(req.id);
    db.prepare("UPDATE offers SET status='Concluída' WHERE id=?").run(req.offer_id);
    addHistory('request', req.id, 'Confirmada', 'Concluída', orgUserId, null);
    addHistory('offer', req.offer_id, 'Reservada', 'Concluída', orgUserId, null);
  });
  tx();
}

module.exports = { institutionForUser, history, addHistory, expireEntities, requestOffer, confirmRequest, cancelRequest, rejectRequest, registerDelivery, confirmReceipt };
