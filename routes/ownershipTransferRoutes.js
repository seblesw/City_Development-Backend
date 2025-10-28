// // routes/ownershipTransferRoutes.js
// const express = require('express');
// const router = express.Router();
// const {
//   createTransferOwnership,
//   previewCalculation,
//   getTransfers,
//   getTransferById,
//   updateTransferStatus,
//   getTransferStats
// } = require('../controllers/ownershipTransferController');

// // Apply authentication middleware to all routes
// const authMiddleware = require("../middlewares/authMiddleware")
// // Routes
// router.post('/',authMiddleware.protect, createTransferOwnership);
// router.post('/preview', previewCalculation);
// router.get('/', getTransfers);
// router.get('/stats', getTransferStats);
// router.get('/:id', getTransferById);
// router.patch('/:id/status', updateTransferStatus);

// module.exports = router;