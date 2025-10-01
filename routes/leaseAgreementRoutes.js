const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware'); 
const { createLeaseAgreement, } = require('../controllers/leaseAgreementController');

router.post('/', authMiddleware.protect, createLeaseAgreement);

module.exports = router;