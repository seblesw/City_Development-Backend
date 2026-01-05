const express = require('express');
const router = express.Router();
const {
  generateLandRecordQR,
  downloadLandRecordQR
} = require('../controllers/qrCodeController');
const authMiddleware = require('../middlewares/authMiddleware');

// Land Record QR code routes
router.get('/:landRecordId/qr',authMiddleware.protect, generateLandRecordQR);           // Get QR code as JSON
router.get('/:landRecordId/qr/download', downloadLandRecordQR);  // Download QR as PNG

module.exports = router;