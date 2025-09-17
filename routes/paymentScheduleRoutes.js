const express = require('express');
const router = express.Router();
const paymentScheduleController = require('../controllers/paymentScheduleController');

router.post('/tax', paymentScheduleController.createTaxSchedulesController);
router.post('/lease', paymentScheduleController.createLeaseSchedulesController);

module.exports = router;