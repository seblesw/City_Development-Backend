// routes/ownershipTransferRoutes.js
const express = require('express');
const router = express.Router();
const {
  createTransferOwnership,
  getTransfers,
  getTransferById,
  updateTransferStatus,
  getTransferStats,
  searchLandRecordsController,
  getLandRecordOwnersController,
  searchRecipientUsersController
} = require('../controllers/ownershipTransferController');

// Apply authentication middleware to all routes
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require('../middlewares/fileStorage');
// Routes
router.post('/',authMiddleware.protect, upload.array('files', 10), createTransferOwnership);
router.get('/search-land-records', searchLandRecordsController);
router.get('/land-record/:land_record_id/owners', authMiddleware.protect, getLandRecordOwnersController);
router.get('/search-recipient-users', authMiddleware.protect, searchRecipientUsersController);
router.get('/',authMiddleware.protect,getTransfers);
router.get('/stats',authMiddleware.protect, getTransferStats);
router.get('/:id',authMiddleware.protect, getTransferById);
router.patch('/:id/status',authMiddleware.protect, updateTransferStatus);

module.exports = router;