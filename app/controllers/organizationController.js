const db = require('../models/db');
const business = require('../services/business');
const { format, isPast } = require('../services/dateUtils');

exports.dashboard = (req, res) => {
  business.expireEntities();
  const institution = business.institutionForUser(req.session.userId);
  const offers = db.prepare("SELECT o.*,i.name institution_name,i.city,i.neighborhood FROM offers o JOIN institutions i ON i.id=o.establishment_id WHERE o.status='Disponível' AND o.deadline>? ORDER BY o.deadline ASC").all(new Date().toISOString());
  res.render('organization/dashboard', { institution, offers, format });
};

exports.listOffers = (req, res) => {
  business.expireEntities();
  let sql = "SELECT o.*,i.name institution_name FROM offers o JOIN institutions i ON i.id=o.establishment_id WHERE 1=1";
  const params = [];
  if (req.query.city) { sql += ' AND o.city LIKE ?'; params.push(`%${req.query.city}%`); }
  if (req.query.category) { sql += ' AND o.category=?'; params.push(req.query.category); }
  if (req.query.availability) { sql += ' AND o.status=?'; params.push(req.query.availability); }
  if (req.query.deadline) { sql += ' AND o.deadline<=?'; params.push(new Date(req.query.deadline).toISOString()); }
  sql += ' ORDER BY o.published_at DESC';
  res.render('organization/offers', { offers: db.prepare(sql).all(...params), filters:req.query, format });
};

exports.offerDetails = (req,res) => {
  const offer=db.prepare('SELECT o.*,i.name institution_name,i.city,i.neighborhood FROM offers o JOIN institutions i ON i.id=o.establishment_id WHERE o.id=?').get(req.params.id);
  if(!offer) return res.status(404).render('errors/404',{title:'Oferta não encontrada'});
  res.render('organization/offer-details',{offer,format});
};

exports.request = (req,res) => { try { business.requestOffer(req.session.userId,Number(req.params.offerId)); req.session.flash='Solicitação enviada.'; res.redirect('/organizacao/solicitacoes'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.requests = (req,res) => { business.expireEntities(); const institution=business.institutionForUser(req.session.userId); const requests=db.prepare('SELECT r.*,o.name offer_name,o.deadline,o.quantity,o.unit,o.status offer_status,i.name institution_name FROM requests r JOIN offers o ON o.id=r.offer_id JOIN institutions i ON i.id=o.establishment_id WHERE r.organization_id=? ORDER BY r.created_at DESC').all(institution.id); res.render('organization/requests',{requests,format}); };
exports.cancel = (req,res) => { try { business.cancelRequest(req.session.userId,Number(req.params.requestId),req.body.reason); req.session.flash='Solicitação cancelada.'; res.redirect('/organizacao/solicitacoes'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.receipt = (req,res) => { try { business.confirmReceipt(req.session.userId,Number(req.params.requestId)); req.session.flash='Recebimento confirmado.'; res.redirect('/organizacao/solicitacoes'); } catch(e) { res.status(400).render('errors/400',{error:e.message}); } };
exports.profile = (req,res) => { const institution=business.institutionForUser(req.session.userId); res.render('organization/profile',{institution,error:null}); };
exports.updateProfile = (req,res) => { try { const institution=business.institutionForUser(req.session.userId); const b=req.body; db.prepare(`UPDATE institutions SET name=?,city=?,neighborhood=?,address=?,phone=?,responsible=?,accepted_types=?,capacity=?,transport=?,storage=?,receiving_hours=? WHERE id=?`).run(b.institutionName,b.city,b.neighborhood,b.address,b.phone,b.responsible,b.acceptedTypes,b.capacity,b.transport,b.storage,b.receivingHours,institution.id); req.session.flash='Perfil atualizado.'; res.redirect('/organizacao/perfil'); } catch(e) { res.status(400).render('organization/profile',{institution:{...req.body},error:e.message}); } };
