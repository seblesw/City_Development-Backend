const express = require('express');
const router = express.Router();
const landController = require('../controllers/landRecordController');
const landValidation = require('../validations/landValidation');

// CRUD Routes
router.post('/', landValidation.createLandValidation, landController.createLand);
router.get('/', landController.getAllLand);
router.get('/:id', landController.getLandById);
router.put('/:id', landValidation.updateLandValidation, landController.updateLand);
router.delete('/:id', landController.deleteLand);

module.exports = router;
