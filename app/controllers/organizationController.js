const store = require('../models/store');
const business = require('../services/business');
const { format, isPast } = require('../services/dateUtils');

exports.dashboard = (req, res) => {
  business.expireEntities();
  const institution = business.institutionForUser(req.session.userId);
  const offers = store.offers
    .filter(offer => offer.status === 'Disponível' && !isPast(offer.deadline))
    .map(offer => {
      const establishment = store.institutions.find(item => item.id === offer.establishment_id);
      return { ...offer, institution_name: establishment?.name };
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  res.render('organization/dashboard', { institution, offers, format });
};

exports.listOffers = (req, res) => {
  business.expireEntities();
  const filters = req.query;
  const deadline = filters.deadline ? new Date(filters.deadline).getTime() : null;
  const offers = store.offers
    .filter(offer => {
      const cityMatches = !filters.city || offer.city.toLocaleLowerCase('pt-BR').includes(String(filters.city).toLocaleLowerCase('pt-BR'));
      const categoryMatches = !filters.category || offer.category === filters.category;
      const statusMatches = !filters.availability || offer.status === filters.availability;
      const deadlineMatches = !Number.isNaN(deadline) && deadline !== null ? new Date(offer.deadline).getTime() <= deadline : true;
      return cityMatches && categoryMatches && statusMatches && deadlineMatches;
    })
    .map(offer => {
      const establishment = store.institutions.find(item => item.id === offer.establishment_id);
      return { ...offer, institution_name: establishment?.name };
    })
    .sort((a, b) => b.published_at.localeCompare(a.published_at));
  res.render('organization/offers', { offers, filters, format });
};

exports.offerDetails = (req, res) => {
  const offer = store.offerWithInstitution(req.params.id);
  if (!offer) return res.status(404).render('errors/404', { title: 'Oferta não encontrada' });
  res.render('organization/offer-details', { offer, format });
};

exports.request = (req, res) => {
  try {
    business.requestOffer(req.session.userId, Number(req.params.offerId));
    req.session.flash = 'Solicitação enviada.';
    res.redirect('/organizacao/solicitacoes');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.requests = (req, res) => {
  business.expireEntities();
  const institution = business.institutionForUser(req.session.userId);
  res.render('organization/requests', { requests: store.requestsForOrganization(institution.id), format });
};

exports.cancel = (req, res) => {
  try {
    business.cancelRequest(req.session.userId, Number(req.params.requestId), req.body.reason);
    req.session.flash = 'Solicitação cancelada.';
    res.redirect('/organizacao/solicitacoes');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.receipt = (req, res) => {
  try {
    business.confirmReceipt(req.session.userId, Number(req.params.requestId));
    req.session.flash = 'Recebimento confirmado.';
    res.redirect('/organizacao/solicitacoes');
  } catch (error) {
    res.status(400).render('errors/400', { error: error.message });
  }
};

exports.profile = (req, res) => {
  res.render('organization/profile', { institution: business.institutionForUser(req.session.userId), error: null });
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
      responsible: b.responsible,
      accepted_types: b.acceptedTypes,
      capacity: b.capacity,
      transport: b.transport,
      storage: b.storage,
      receiving_hours: b.receivingHours
    });
    req.session.flash = 'Perfil atualizado.';
    res.redirect('/organizacao/perfil');
  } catch (error) {
    res.status(400).render('organization/profile', { institution: { ...req.body }, error: error.message });
  }
};
