const store = require('../models/store');
const business = require('../services/business');
const { nowIso, localToUtc, isPast, format } = require('../services/dateUtils');

exports.dashboard = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  business.expireEntities();
  const offers = store.offers
    .filter(offer => offer.establishment_id === institution.id)
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  res.render('establishment/dashboard', { institution, offers, format, isPast });
};

exports.newOffer = (req, res) => res.render('establishment/offer-form', { offer: null, error: null, format });

exports.createOffer = (req, res) => {
  try {
    const b = req.body;
    const quantity = Number(b.quantity);
    const deadline = localToUtc(b.deadline);
    if (!b.name?.trim() || !b.description?.trim() || !b.category?.trim() || !b.conservation?.trim() || !b.city?.trim() || !b.neighborhood?.trim() || !b.pickupInstructions?.trim()) {
      throw new Error('Preencha todos os campos obrigatórios.');
    }
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('A quantidade deve ser maior que zero.');
    if (!deadline || isPast(deadline)) throw new Error('Informe um prazo de retirada futuro.');
    const institution = business.institutionForUser(req.session.userId);
    const published = nowIso();
    const eligible = new Date(deadline).getTime() - new Date(published).getTime() >= 2 * 60 * 60 * 1000;
    const offer = store.addOffer({
      establishment_id: institution.id,
      name: b.name.trim(),
      description: b.description.trim(),
      category: b.category.trim(),
      quantity,
      unit: b.unit.trim(),
      conservation: b.conservation.trim(),
      expiration_info: b.expirationInfo?.trim() || null,
      deadline,
      city: b.city.trim(),
      neighborhood: b.neighborhood.trim(),
      pickup_instructions: b.pickupInstructions.trim(),
      status: 'Disponível',
      published_at: published,
      eligible,
      eligibility_reason: eligible ? 'Publicado com pelo menos duas horas de antecedência' : 'Prazo inferior a duas horas'
    });
    business.addHistory('offer', offer.id, null, 'Disponível', req.session.userId, null);
    req.session.flash = 'Oferta publicada com sucesso.';
    res.redirect('/estabelecimento');
  } catch (error) {
    res.status(400).render('establishment/offer-form', { offer: req.body, error: error.message, format });
  }
};

exports.editOffer = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  const offer = store.offerForEstablishment(req.params.id, institution.id);
  if (!offer) return res.status(404).render('errors/404', { title: 'Oferta não encontrada' });
  if (offer.status !== 'Disponível') return res.status(403).render('errors/403', { title: 'Esta oferta não pode ser editada' });
  res.render('establishment/offer-form', { offer, error: null, format });
};

exports.updateOffer = (req, res) => {
  try {
    const institution = business.institutionForUser(req.session.userId);
    const offer = store.offerForEstablishment(req.params.id, institution.id);
    if (!offer) throw new Error('Oferta não encontrada.');
    if (offer.status !== 'Disponível') throw new Error('Somente ofertas disponíveis podem ser editadas.');
    const b = req.body;
    const quantity = Number(b.quantity);
    const deadline = localToUtc(b.deadline);
    if (!Number.isFinite(quantity) || quantity <= 0 || !deadline || isPast(deadline)) throw new Error('Quantidade ou prazo inválido.');
    const eligible = new Date(deadline).getTime() - new Date(offer.published_at).getTime() >= 2 * 60 * 60 * 1000;
    store.updateOffer(offer.id, {
      name: b.name,
      description: b.description,
      category: b.category,
      quantity,
      unit: b.unit,
      conservation: b.conservation,
      expiration_info: b.expirationInfo || null,
      deadline,
      city: b.city,
      neighborhood: b.neighborhood,
      pickup_instructions: b.pickupInstructions,
      eligible,
      eligibility_reason: eligible ? 'Publicado com pelo menos duas horas de antecedência' : 'Prazo inferior a duas horas'
    });
    req.session.flash = 'Oferta atualizada.';
    res.redirect('/estabelecimento');
  } catch (error) {
    res.status(400).render('establishment/offer-form', { offer: { ...req.body, id: req.params.id }, error: error.message, format });
  }
};

exports.offerDetails = (req, res) => {
  const institution = business.institutionForUser(req.session.userId);
  const offer = store.offerForEstablishment(req.params.id, institution.id);
  if (!offer) return res.status(404).render('errors/404', { title: 'Oferta não encontrada' });
  res.render('establishment/offer-details', {
    offer,
    requests: store.requestsForOffer(offer.id),
    history: business.history('offer', offer.id),
    format
  });
};

exports.confirm = (req, res) => {
  try {
    business.confirmRequest(req.session.userId, Number(req.params.requestId));
    req.session.flash = 'Solicitação confirmada.';
    res.redirect(req.get('referer') || '/estabelecimento');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.reject = (req, res) => {
  try {
    business.rejectRequest(req.session.userId, Number(req.params.requestId), req.body.reason);
    req.session.flash = 'Solicitação rejeitada.';
    res.redirect(req.get('referer') || '/estabelecimento');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.cancel = (req, res) => {
  try {
    business.cancelRequest(req.session.userId, Number(req.params.requestId), req.body.reason);
    req.session.flash = 'Operação cancelada.';
    res.redirect(req.get('referer') || '/estabelecimento');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.delivery = (req, res) => {
  try {
    const quantity = Number(req.body.deliveredQuantity);
    const actualPickupAt = localToUtc(req.body.actualPickupAt);
    if (!Number.isFinite(quantity) || quantity <= 0 || !actualPickupAt) {
      throw new Error('Informe uma quantidade e um horário de retirada válidos.');
    }
    business.registerDelivery(req.session.userId, Number(req.params.requestId), actualPickupAt, quantity);
    req.session.flash = 'Entrega registrada.';
    res.redirect(req.get('referer') || '/estabelecimento');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.profile = (req, res) => {
  res.render('establishment/profile', { institution: business.institutionForUser(req.session.userId), error: null });
};

exports.updateProfile = (req, res) => {
  try {
    const institution = business.institutionForUser(req.session.userId);
    const b = req.body;
    store.updateInstitution(institution.id, {
      name: b.institutionName,
      city: b.city,
      neighborhood: b.neighborhood,
      address: b.address,
      phone: b.phone,
      responsible: b.responsible
    });
    req.session.flash = 'Perfil atualizado.';
    res.redirect('/estabelecimento/perfil');
  } catch (error) {
    res.status(400).render('establishment/profile', { institution: { ...req.body }, error: error.message });
  }
};
