const express = require('express');
const router = express.Router();
const { createReminders, createOverdue, sendNotifications, createGlobalNoticeSchedule, getNotices } = require('../controllers/notificationController');
router.get('/notices', getNotices);
router.post('/reminders', createReminders);
router.post('/overdue', createOverdue);
router.post('/send', sendNotifications);
router.post('/global-notice', createGlobalNoticeSchedule);

module.exports = router;