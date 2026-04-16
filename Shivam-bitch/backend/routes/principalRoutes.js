const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/principalController');

router.get('/classes',        ctrl.getClasses);
router.post('/classes',       ctrl.createClass);
router.post('/promote-class', ctrl.promoteClass);
router.delete('/classes/:id', ctrl.deleteClass);

router.get('/members',                  ctrl.getMembers);
router.post('/members',                 ctrl.createMember);
router.put('/members/:id',              ctrl.updateMember);
router.delete('/members/:id',           ctrl.deleteMember);

router.get('/users',                    ctrl.getUsers);
router.patch('/members/:id/restrict',   ctrl.restrictMember);
router.post('/members/:id/force-logout',ctrl.forceLogoutMember);

// ID Card Form routes
router.post('/id-card-form',  ctrl.saveIdCardForm);
router.get('/id-card-form',   ctrl.getIdCardForm);

// Purchase Orders (vendor orders visible to principal by school)
router.get('/purchase-orders', ctrl.getPurchaseOrders);

module.exports = router;
