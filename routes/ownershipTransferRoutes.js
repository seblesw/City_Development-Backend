// routes/ownershipTransferRoutes.js
const express = require('express');
const router = express.Router();
const {
  createTransferOwnership,
  previewCalculation,
  getTransfers,
  getTransferById,
  updateTransferStatus,
  getTransferStats
} = require('../controllers/ownershipTransferController');

// Apply authentication middleware to all routes
const authMiddleware = require("../middlewares/authMiddleware")
// Routes
router.post('/',authMiddleware.protect, createTransferOwnership);
router.post('/preview', previewCalculation);
router.get('/',authMiddleware.protect,getTransfers);
router.get('/stats',authMiddleware.protect, getTransferStats);
router.get('/:id',authMiddleware.protect, getTransferById);
router.patch('/:id/status',authMiddleware.protect, updateTransferStatus);

module.exports = router;