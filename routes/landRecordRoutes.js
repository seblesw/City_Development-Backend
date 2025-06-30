const express = require('express');
const router = express.Router();
const landController = require('../controllers/landRecordController');
// const landValidation = require('../validations/landValidation');

// CRUD Routes
router.post('/',  landController.createLandRecord);


module.exports = router;
