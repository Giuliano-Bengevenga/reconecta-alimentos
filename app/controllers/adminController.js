const store = require('../models/store');
const business = require('../services/business');

function calculateMetrics() {
  business.expireEntities();
  const eligibleClosed = store.offers.filter(offer => offer.eligible && new Date(offer.deadline).getTime() <= Date.now());
  const completed = store.requests.filter(request => request.status === 'Concluída');
  const successful = completed.filter(request => {
    const offer = store.offers.find(item => item.id === request.offer_id);
    return offer?.eligible && request.within_deadline === true;
  });
  const cancellationCounts = new Map();
  for (const item of store.statusHistory.filter(entry => entry.to_status === 'Cancelada')) {
    const reason = item.reason || 'Sem motivo';
    cancellationCounts.set(reason, (cancellationCounts.get(reason) || 0) + 1);
  }
  const unitTotals = new Map();
  for (const request of completed) {
    const offer = store.offers.find(item => item.id === request.offer_id);
    if (offer && request.delivered_quantity !== null) {
      unitTotals.set(offer.unit, (unitTotals.get(offer.unit) || 0) + request.delivered_quantity);
    }
  }
  const confirmations = store.requests
    .filter(request => request.establishment_confirmed_at)
    .map(request => {
      const offer = store.offers.find(item => item.id === request.offer_id);
      return offer ? (new Date(request.establishment_confirmed_at) - new Date(offer.published_at)) / 60000 : null;
    })
    .filter(value => Number.isFinite(value));
  const avgMinutes = confirmations.length
    ? Math.round(confirmations.reduce((sum, value) => sum + value, 0) / confirmations.length)
    : null;

  return {
    offers: store.offers.length,
    completed: completed.length,
    within: successful.length,
    denominator: eligibleClosed.length,
    success: eligibleClosed.length ? ((successful.length / eligibleClosed.length) * 100).toFixed(1) + '%' : 'Sem dados suficientes',
    avgMinutes,
    cancellations: [...cancellationCounts].map(([reason, count]) => ({ reason, count })),
    units: [...unitTotals].map(([unit, total]) => ({ unit, total }))
  };
}

exports.calculateMetrics = calculateMetrics;

exports.dashboard = (req, res) => {
  const users = store.users.map(user => ({
    ...user,
    institution_name: store.institutionForUser(user.id)?.name || null
  }));
  res.render('admin/dashboard', { users, metrics: calculateMetrics() });
};

exports.toggleUser = (req, res) => {
  const user = store.findUserById(req.params.id);
  if (!user || user.role === 'admin') return res.status(403).render('errors/403', { title: 'Não é possível alterar este usuário' });
  user.active = !user.active;
  req.session.flash = user.active ? 'Conta ativada.' : 'Conta desativada.';
  res.redirect('/admin');
};
