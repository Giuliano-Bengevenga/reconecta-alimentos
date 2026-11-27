const db = require('../models/db');
const business = require('../services/business');

exports.dashboard = (req,res) => {
  business.expireEntities();
  const users=db.prepare('SELECT u.*,i.name institution_name FROM users u LEFT JOIN institutions i ON i.user_id=u.id ORDER BY u.created_at DESC').all();
  const offers=db.prepare("SELECT o.* FROM offers o").all();
  const eligible=offers.filter(o=>o.eligible && o.status!== 'Disponível' && o.status!== 'Reservada' && new Date(o.deadline).getTime()<Date.now());
  const completed=db.prepare("SELECT r.*,o.eligible,o.unit,o.quantity FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.status='Concluída'").all();
  const successful=completed.filter(r=>r.eligible && r.within_deadline===1);
  const cancellations=db.prepare("SELECT h.reason,COUNT(*) count FROM status_history h WHERE h.to_status='Cancelada' GROUP BY h.reason").all();
  const units=db.prepare("SELECT o.unit,SUM(r.delivered_quantity) total FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.status='Concluída' AND r.delivered_quantity IS NOT NULL GROUP BY o.unit").all();
  const avgRows=db.prepare(`SELECT AVG((julianday(r.establishment_confirmed_at)-julianday(o.published_at))*1440) avg_minutes
    FROM requests r JOIN offers o ON o.id=r.offer_id WHERE r.establishment_confirmed_at IS NOT NULL`).get();
  res.render('admin/dashboard',{
    users, metrics:{
      offers:offers.length,
      completed:completed.length,
      within:successful.length,
      denominator:eligible.length,
      success:eligible.length ? ((successful.length/eligible.length)*100).toFixed(1)+'%' : 'Sem dados suficientes',
      avgMinutes:avgRows.avg_minutes ? Math.round(avgRows.avg_minutes) : null,
      cancellations,units
    }
  });
};

exports.toggleUser = (req,res) => {
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if(!user || user.role==='admin') return res.status(403).render('errors/403',{title:'Não é possível alterar este usuário'});
  db.prepare('UPDATE users SET active=? WHERE id=?').run(user.active ? 0 : 1, user.id);
  req.session.flash=user.active?'Conta desativada.':'Conta ativada.';
  res.redirect('/admin');
};
