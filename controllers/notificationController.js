const { GlobalNoticeSchedule } = require('../models');
const { createReminderNotifications, createOverdueNotifications, sendPendingNotifications, createGlobalNoticeNotifications } = require('../services/notificationService');

const createReminders = async (req, res) => {
  try {
    const notifications = await createReminderNotifications();
    res.status(201).json({
      success: true,
      message: `${notifications.length} የአስታዋሽ ማሳወቂያዎች ተፈጥሯል`,
      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `የአስታዋሽ ማሳወቂያ መፍጠር አልተሳካም: ${error.message}`,
    });
  }
};

const createOverdue = async (req, res) => {
  try {
    const notifications = await createOverdueNotifications();
    res.status(201).json({
      success: true,
      message: `${notifications.length} ያለፈበት ማሳወቂያዎች ተፈጥሯል`,
      notifications,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `ያለፈበት ማሳወቂያ መፍጠር አልተሳካም: ${error.message}`,
    });
  }
};

const sendNotifications = async (req, res) => {
  try {
    const sentCount = await sendPendingNotifications();
    res.status(200).json({
      success: true,
      message: `${sentCount} ማሳወቂያዎች ተልከዋል`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `ማሳወቂያ መላክ አልተሳካም: ${error.message}`,
    });
  }
};
const createGlobalNoticeSchedule = async (req, res) => {
  const { message, scheduled_date } = req.body;
  if (!message || !scheduled_date) {
    return res.status(400).json({
      success: false,
      message: 'Message and scheduled_date are required',
    });
  }

  try {
    const noticeSchedule = await GlobalNoticeSchedule.create({
      message,
      scheduled_date: new Date(scheduled_date),
      is_active: true,
    });
    res.status(201).json({
      success: true,
      message: 'አጠቃላይ ማሳወቂያ notice መርሃ ግብር ተፈጥሯል',
      noticeSchedule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `አጠቃላይ ማሳወቂያ መርሃ ግብር መፍጠር አልተሳካም: ${error.message}`,
    });
  }
};

const getNotices = async (req, res) => {
  try {
    const notices = await GlobalNoticeSchedule.findAll();
    res.status(200).json({
      success: true,
      notices,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `የአጠቃላይ ማሳወቂያ መርሃ ግብር መውሰድ አልተሳካም: ${error.message}`,
    });
  }
};

module.exports = {
  createReminders,
  createOverdue,
  sendNotifications,
  createGlobalNoticeSchedule,
  getNotices,
};