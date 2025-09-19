const express = require('express');
const router = express.Router();
const { createReminders, createOverdue, sendNotifications } = require('../controllers/notificationController');

router.post('/reminders', createReminders);
router.post('/overdue', createOverdue);
router.post('/send', sendNotifications);

module.exports = router;