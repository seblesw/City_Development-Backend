const express = require('express');
const router = express.Router();
const {
  generateQR,
  getPrintableQR,
  downloadQR,
  getQRText
} = require('../controllers/qrCodeController');

// QR Code routes
router.get('/:documentId/qr', generateQR);              // Get QR code as JSON with base64 image
router.get('/:documentId/qr/print', getPrintableQR);    // Get SVG for printing
router.get('/:documentId/qr/download', downloadQR);     // Download PNG
router.get('/:documentId/qr/text', getQRText);          // Get text data only

module.exports = router;