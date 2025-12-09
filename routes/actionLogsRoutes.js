const express = require('express');
const { 
  getActionLog, 
  getAllActionLogs, 
  getActionLogStats,
  getActionLogFilters 
} = require("../controllers/actionLogController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.get('/', authMiddleware.protect, getAllActionLogs);
router.get('/stats', authMiddleware.protect, getActionLogStats);
router.get('/filters', authMiddleware.protect, getActionLogFilters);
router.get('/:landRecordId', authMiddleware.protect, getActionLog);

module.exports = router;