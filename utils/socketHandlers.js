const { User } = require('../models');
const notificationUtils = require('./notificationUtils');

/**
 * Setup Socket.IO event handlers
 */
const setupSocketHandlers = (io, socket) => {
  console.log('User connected:', socket.id);

  // User authentication and session setup
  socket.on('user_authenticated', async (userData) => {
    try {
      const { userId, userRole } = userData;
      
      // Add user to session tracking
      notificationUtils.userSessionUtils.addUserSession(userId, socket.id);
      socket.join(`user_${userId}`);
      
      console.log(`User ${userId} authenticated with socket ${socket.id}`);
      
      // Send initial new actions count
      await notificationUtils.sendUserNewActionsCount(io, userId);
      
    } catch (error) {
      console.error('Error in user authentication:', error);
    }
  });

  // Get new actions count based on last login
  socket.on('get_new_actions_count', async (userId) => {
    try {
      await notificationUtils.sendUserNewActionsCount(io, userId);
    } catch (error) {
      console.error('Error getting new actions count:', error);
      socket.emit('new_actions_count', { count: 0 });
    }
  });

  // Get new actions list (actions after last login)
  socket.on('get_new_actions', async (data) => {
    try {
      const { userId, limit = 20 } = data;
      const user = await User.findByPk(userId);
      
      if (!user || !user.last_login) {
        socket.emit('new_actions_list', []);
        return;
      }

      const newActions = await notificationUtils.getNewActionsSince(userId, user.last_login, limit);
      console.log(`Sending ${newActions.length} new actions to user ${userId}`);
      socket.emit('new_actions_list', newActions);
      
    } catch (error) {
      console.error('Error getting new actions:', error);
      socket.emit('new_actions_list', []);
    }
  });

  // Mark actions as seen (reset badge count)
  socket.on('mark_actions_seen', async (userId) => {
    try {
      await notificationUtils.markActionsAsSeen(userId);
      socket.emit('new_actions_count', { count: 0 });
      console.log(`User ${userId} marked actions as seen`);
    } catch (error) {
      console.error('Error marking actions as seen:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const userId = notificationUtils.userSessionUtils.removeUserSessionBySocketId(socket.id);
    if (userId) {
      console.log(`User ${userId} disconnected`);
    }
    console.log('User disconnected:', socket.id);
  });
};

module.exports = {
  setupSocketHandlers
};