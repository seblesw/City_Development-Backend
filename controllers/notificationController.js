const { createReminderNotifications, createOverdueNotifications, sendPendingNotifications } = require('../services/notificationService');

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

module.exports = {
  createReminders,
  createOverdue,
  sendNotifications,
};