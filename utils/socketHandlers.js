const { User } = require('../models');
const notificationUtils = require('./notificationUtils');

/**
 * Setup Socket.IO event handlers for push notifications
 */
const setupSocketHandlers = (io, socket) => {

  // User authentication and session setup
  socket.on('user_authenticated', async (userData) => {
    try {
      const { userId, userRole } = userData;
      
      // Add user to session tracking
      notificationUtils.userSessionUtils.addUserSession(userId, socket.id);
      socket.join(`user_${userId}`);
      
      
      // ✅ Send initial unseen count from push_notifications table
      await notificationUtils.sendUserUnseenCount(io, userId);
      
    } catch (error) {
    }
  });

  // Get unseen notifications count
  socket.on('get_unseen_count', async (userId) => {
    try {
      await notificationUtils.sendUserUnseenCount(io, userId);
    } catch (error) {
      socket.emit('unseen_count_update', { count: 0 });
    }
  });

  // Get notifications list from push_notifications table
  socket.on('get_notifications', async (data) => {
    try {
      const { userId, limit = 20, offset = 0 } = data;
      
      const notifications = await notificationUtils.getUserNotifications(userId, limit, offset);
      socket.emit('notifications_list', notifications);
      
    } catch (error) {
      socket.emit('notifications_list', []);
    }
  });

  // Mark notifications as seen in push_notifications table
// In your socketHandlers.js - update the mark_notifications_seen handler
socket.on('mark_notifications_seen', async (data) => {
  try {
    const { userId, notificationIds } = data;
    
    // If notificationIds is provided, mark only those as seen
    // If notificationIds is null/empty, mark all as seen
    await notificationUtils.markNotificationsAsSeen(userId, notificationIds);
    
    // Send updated unseen count
    await notificationUtils.sendUserUnseenCount(io, userId);
    
    
  } catch (error) {
  }
});

  // Handle disconnection
  socket.on('disconnect', () => {
    const userId = notificationUtils.userSessionUtils.removeUserSessionBySocketId(socket.id);
    if (userId) {
    }
  });
};

module.exports = {
  setupSocketHandlers
};