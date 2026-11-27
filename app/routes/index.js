const express = require('express');
const auth = require('../controllers/authController');
const establishment = require('../controllers/institutionController');
const organization = require('../controllers/organizationController');
const admin = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middlewares/auth');
const db = require('../models/db');
const router = express.Router();

router.get('/', auth.showLanding);
router.get('/login', auth.showLogin);
router.post('/login', auth.login);
router.post('/logout', requireAuth, auth.logout);
router.get('/cadastro', auth.showRegister);
router.post('/cadastro', auth.register);

router.get('/estabelecimento', requireAuth, requireRole('establishment'), establishment.dashboard);
router.get('/estabelecimento/ofertas/nova', requireAuth, requireRole('establishment'), establishment.newOffer);
router.post('/estabelecimento/ofertas', requireAuth, requireRole('establishment'), establishment.createOffer);
router.get('/estabelecimento/ofertas/:id/editar', requireAuth, requireRole('establishment'), establishment.editOffer);
router.post('/estabelecimento/ofertas/:id', requireAuth, requireRole('establishment'), establishment.updateOffer);
router.get('/estabelecimento/ofertas/:id', requireAuth, requireRole('establishment'), establishment.offerDetails);
router.post('/estabelecimento/solicitacoes/:requestId/confirmar', requireAuth, requireRole('establishment'), establishment.confirm);
router.post('/estabelecimento/solicitacoes/:requestId/rejeitar', requireAuth, requireRole('establishment'), establishment.reject);
router.post('/estabelecimento/solicitacoes/:requestId/cancelar', requireAuth, requireRole('establishment'), establishment.cancel);
router.post('/estabelecimento/solicitacoes/:requestId/entrega', requireAuth, requireRole('establishment'), establishment.delivery);
router.get('/estabelecimento/perfil', requireAuth, requireRole('establishment'), establishment.profile);
router.post('/estabelecimento/perfil', requireAuth, requireRole('establishment'), establishment.updateProfile);

router.get('/organizacao', requireAuth, requireRole('organization'), organization.dashboard);
router.get('/organizacao/ofertas', requireAuth, requireRole('organization'), organization.listOffers);
router.get('/organizacao/ofertas/:id', requireAuth, requireRole('organization'), organization.offerDetails);
router.post('/organizacao/ofertas/:offerId/solicitar', requireAuth, requireRole('organization'), organization.request);
router.get('/organizacao/solicitacoes', requireAuth, requireRole('organization'), organization.requests);
router.post('/organizacao/solicitacoes/:requestId/cancelar', requireAuth, requireRole('organization'), organization.cancel);
router.post('/organizacao/solicitacoes/:requestId/recebimento', requireAuth, requireRole('organization'), organization.receipt);
router.get('/organizacao/perfil', requireAuth, requireRole('organization'), organization.profile);
router.post('/organizacao/perfil', requireAuth, requireRole('organization'), organization.updateProfile);

router.get('/admin', requireAuth, requireRole('admin'), admin.dashboard);
router.post('/admin/usuarios/:id/status', requireAuth, requireRole('admin'), admin.toggleUser);

router.use((req,res) => res.status(404).render('errors/404', { title:'Página não encontrada' }));

module.exports = router;
