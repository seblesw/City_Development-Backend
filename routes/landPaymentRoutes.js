const express = require('express');
const router = express.Router();
const landPaymentController = require('../controllers/landPaymentController');
const { createLandPaymentValidation } = require('../validations/landPaymentValidation');
const validateRequest = require('../middlewares/validateRequest');

// Create payment
router.post('/', createLandPaymentValidation, validateRequest, landPaymentController.createLandPayment);

// Read all payments
router.get('/', landPaymentController.getAllLandPayments);

// Read payment by ID
router.get('/:id', landPaymentController.getLandPaymentById);

// Update payment
router.put('/:id', createLandPaymentValidation, validateRequest, landPaymentController.updateLandPayment);

// Delete payment
router.delete('/:id', landPaymentController.deleteLandPayment);

module.exports = router;
