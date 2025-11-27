const express = require('express');
const router = express.Router();
const paymentScheduleController = require('../controllers/paymentScheduleController');
router.get('/', paymentScheduleController.getSchedulesController);
router.post('/tax', paymentScheduleController.createTaxSchedulesController);
router.post('/lease', paymentScheduleController.createLeaseSchedulesController);
router.post('/check-overdue', paymentScheduleController.checkOverdueSchedulesController);

module.exports = router;