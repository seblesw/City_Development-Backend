const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware'); 
const { createLeaseAgreement, getLeaseAgreement, getLeasedAreaReport } = require('../controllers/leaseAgreementController');

router.post('/', authMiddleware.protect, createLeaseAgreement);
router.get('/:id', authMiddleware.protect, getLeaseAgreement);
router.get('/:landRecordId/report', authMiddleware.protect, getLeasedAreaReport);

module.exports = router;