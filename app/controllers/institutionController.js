const db = require('../models/db');
const business = require('../services/business');
const { nowIso, localToUtc, isPast, format } = require('../services/dateUtils');

exports.dashboard = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  const offers = db.prepare('SELECT * FROM offers WHERE establishment_id=? ORDER BY published_at DESC').all(institution.id);
  business.expireEntities();
  res.render('establishment/dashboard', { institution, offers: db.prepare('SELECT * FROM offers WHERE establishment_id=? ORDER BY published_at DESC').all(institution.id), format, isPast });
};

exports.newOffer = (req, res) => res.render('establishment/offer-form', { offer: null, error: null, format });

exports.createOffer = (req, res) => {
  try {
    const b = req.body;
    const quantity = Number(b.quantity);
    const deadline = localToUtc(b.deadline);
    if (!b.name?.trim() || !b.description?.trim() || !b.category?.trim() || !b.conservation?.trim() || !b.city?.trim() || !b.neighborhood?.trim() || !b.pickupInstructions?.trim()) throw new Error('Preencha todos os campos obrigatórios.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    if (!deadline || isPast(deadline)) throw new Error('Informe um prazo de retirada futuro.');
    const institution = business.institutionForUser(req.session.userId);
    const published = nowIso();
    const publishedDate = new Date(published);
    const deadlineDate = new Date(deadline);
    const eligible = deadlineDate.getTime() - publishedDate.getTime() >= 2 * 60 * 60 * 1000;
    const tx = db.transaction(() => {
      const result = db.prepare(`INSERT INTO offers(establishment_id,name,description,category,quantity,unit,conservation,expiration_info,deadline,city,neighborhood,pickup_instructions,status,published_at,eligible,eligibility_reason)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(institution.id,b.name.trim(),b.description.trim(),b.category.trim(),quantity,b.unit.trim(),b.conservation.trim(),b.expirationInfo?.trim() || null,deadline,b.city.trim(),b.neighborhood.trim(),b.pickupInstructions.trim(),'Disponível',published,eligible ? 1 : 0,eligible ? 'Publicado com pelo menos duas horas de antecedência' : 'Prazo inferior a duas horas');
      business.addHistory('offer', result.lastInsertRowid, null, 'Disponível', req.session.userId, null);
    });
    tx();
    req.session.flash = 'Oferta publicada com sucesso.';
    res.redirect('/estabelecimento');
  } catch (error) {
    res.status(400).render('establishment/offer-form', { offer: req.body, error: error.message, format });
  }
};

exports.editOffer = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  const offer = db.prepare('SELECT * FROM offers WHERE id=? AND establishment_id=?').get(req.params.id, institution.id);
  if (!offer) return res.status(404).render('errors/404', { title: 'Oferta não encontrada' });
  if (offer.status !== 'Disponível') return res.status(403).render('errors/403', { title: 'Esta oferta não pode ser editada' });
  res.render('establishment/offer-form', { offer, error: null, format });
};

exports.updateOffer = (req, res) => {
  try {
    const institution = business.institutionForUser(req.session.userId);
    const offer = db.prepare('SELECT * FROM offers WHERE id=? AND establishment_id=?').get(req.params.id, institution.id);
    if (!offer) throw new Error('Oferta não encontrada.');
    if (offer.status !== 'Disponível') throw new Error('Somente ofertas disponíveis podem ser editadas.');
    const b = req.body;
    const quantity = Number(b.quantity);
    const deadline = localToUtc(b.deadline);
    if (!Number.isFinite(quantity) || quantity <= 0 || !deadline || isPast(deadline)) throw new Error('Quantidade ou prazo inválido.');
    const eligible = new Date(deadline).getTime() - new Date(offer.published_at).getTime() >= 2 * 60 * 60 * 1000;
    db.prepare(`UPDATE offers SET name=?,description=?,category=?,quantity=?,unit=?,conservation=?,expiration_info=?,deadline=?,city=?,neighborhood=?,pickup_instructions=?,eligible=?,eligibility_reason=? WHERE id=?`)
      .run(b.name,b.description,b.category,quantity,b.unit,b.conservation,b.expirationInfo||null,deadline,b.city,b.neighborhood,b.pickupInstructions,eligible ? 1 : 0,eligible ? 'Publicado com pelo menos duas horas de antecedência' : 'Prazo inferior a duas horas',offer.id);
    req.session.flash = 'Oferta atualizada.';
    res.redirect('/estabelecimento');
  } catch (error) {
    res.status(400).render('establishment/offer-form', { offer: { ...req.body, id: req.params.id }, error: error.message, format });
  }
};

exports.offerDetails = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  const offer = db.prepare('SELECT o.*, i.name institution_name,i.address,i.phone FROM offers o JOIN institutions i ON i.id=o.establishment_id WHERE o.id=? AND o.establishment_id=?').get(req.params.id, institution.id);
  if (!offer) return res.status(404).render('errors/404', { title: 'Oferta não encontrada' });
  const requests = db.prepare('SELECT r.*, i.name organization_name,i.address,i.phone,i.responsible FROM requests r JOIN institutions i ON i.id=r.organization_id WHERE r.offer_id=? ORDER BY r.created_at DESC').all(offer.id);
  res.render('establishment/offer-details', { offer, requests, history: business.history('offer', offer.id), format });
};

exports.confirm = (req,res) => { try { business.confirmRequest(req.session.userId, Number(req.params.requestId)); req.session.flash='Solicitação confirmada.'; res.redirect(req.get('referer')||'/estabelecimento'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.reject = (req,res) => { try { business.rejectRequest(req.session.userId,Number(req.params.requestId),req.body.reason); req.session.flash='Solicitação rejeitada.'; res.redirect(req.get('referer')||'/estabelecimento'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.cancel = (req,res) => { try { business.cancelRequest(req.session.userId,Number(req.params.requestId),req.body.reason); req.session.flash='Operação cancelada.'; res.redirect(req.get('referer')||'/estabelecimento'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.delivery = (req,res) => { try { const quantity=Number(req.body.deliveredQuantity); if(!Number.isFinite(quantity)||quantity<=0) throw new Error('Informe uma quantidade efetivamente entregue válida.'); business.registerDelivery(req.session.userId,Number(req.params.requestId),localToUtc(req.body.actualPickupAt),quantity); req.session.flash='Entrega registrada.'; res.redirect(req.get('referer')||'/estabelecimento'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };

exports.profile = (req,res) => {
  res.render('establishment/profile',{institution:business.institutionForUser(req.session.userId),error:null});
};

exports.updateProfile = (req,res) => {
  try {
    const institution=business.institutionForUser(req.session.userId);
    const b=req.body;
    db.prepare('UPDATE institutions SET name=?,city=?,neighborhood=?,address=?,phone=?,responsible=? WHERE id=?')
      .run(b.institutionName,b.city,b.neighborhood,b.address,b.phone,b.responsible,institution.id);
    req.session.flash='Perfil atualizado.';
    res.redirect('/estabelecimento/perfil');
  } catch(e) {
    res.status(400).render('establishment/profile',{institution:{...req.body},error:e.message});
  }
};
