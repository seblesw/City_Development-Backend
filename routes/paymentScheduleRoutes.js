const express = require('express');
const router = express.Router();
const paymentScheduleController = require('../controllers/paymentScheduleController');
const authMiddleware = require('../middlewares/authMiddleware');
router.get('/', paymentScheduleController.getSchedulesController);
router.post('/tax',authMiddleware.protect, paymentScheduleController.createTaxSchedulesController);
router.post('/lease', paymentScheduleController.createLeaseSchedulesController);
router.post('/check-overdue', paymentScheduleController.checkOverdueSchedulesController);

module.exports = router;