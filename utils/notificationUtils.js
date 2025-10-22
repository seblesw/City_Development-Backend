const { Op } = require('sequelize');
const{ LandRecord,User} = require('../models');


// Store user sessions (in production, use Redis)
const userSockets = new Map(); // userId -> socketId

/**
 * Get new actions since user's last login
 */
const getNewActionsSince = async (userId, sinceDate, limit = 20) => {
  try {
    // Get user's administrative unit to filter relevant actions
    const user = await User.findByPk(userId);
    
    if (!user) {
      console.log(`User ${userId} not found`);
      return [];
    }

    const adminUnitId = user.administrative_unit_id;

    // Get land records with action logs from the user's administrative unit
    let landRecords;
    if (adminUnitId) {
      landRecords = await LandRecord.findAll({
        attributes: ['id', 'parcel_number', 'action_log', 'administrative_unit_id'],
        where: {
          administrative_unit_id: adminUnitId,
          action_log: {
            [Op.ne]: null
          }
        }
      });
    } else {
      // If no admin unit, get all records (for admin users)
      landRecords = await LandRecord.findAll({
        attributes: ['id', 'parcel_number', 'action_log'],
        where: {
          action_log: {
            [Op.ne]: null
          }
        }
      });
    }

    let allActions = [];
    
    landRecords.forEach(record => {
      const actions = Array.isArray(record.action_log) ? record.action_log : [];
      actions.forEach(action => {
        const actionDate = new Date(action.changed_at);
        // Only include actions after the sinceDate
        if (actionDate > new Date(sinceDate)) {
          allActions.push({
            land_record_id: record.id,
            parcel_number: record.parcel_number,
            administrative_unit_id: record.administrative_unit_id,
            ...action,
            changed_at: actionDate
          });
        }
      });
    });

    // Sort by date (newest first)
    allActions.sort((a, b) => b.changed_at - a.changed_at);
    
    // Limit results
    return allActions.slice(0, limit).map(action => ({
      ...action,
      changed_at: action.changed_at.toISOString()
    }));
    
  } catch (error) {
    console.error('Error getting new actions:', error);
    return [];
  }
};

/**
 * Get user's new actions count based on last login
 */
const getUserNewActionsCount = async (userId) => {
  try {
    const user = await User.findByPk(userId);
    if (user && user.last_login) {
      const newActions = await getNewActionsSince(userId, user.last_login);
      return newActions.length;
    }
    return 0;
  } catch (error) {
    console.error('Error getting user new actions count:', error);
    return 0;
  }
};

/**
 * Send new actions count to a specific user
 */
const sendUserNewActionsCount = async (io, userId) => {
  try {
    const count = await getUserNewActionsCount(userId);
    io.to(`user_${userId}`).emit('new_actions_count', { count });
    console.log(`Sent new actions count ${count} to user ${userId}`);
    return count;
  } catch (error) {
    console.error('Error sending new actions count:', error);
    io.to(`user_${userId}`).emit('new_actions_count', { count: 0 });
    return 0;
  }
};

/**
 * Send new actions count to all connected users
 */
const sendNewActionsCountToAllUsers = async (io) => {
  try {
    for (const [userId, socketId] of userSockets.entries()) {
      await sendUserNewActionsCount(io, userId);
    }
    console.log('Updated actions count for all connected users');
  } catch (error) {
    console.error('Error sending actions count to all users:', error);
  }
};

/**
 * Notify about a new action to relevant users
 */
const notifyNewAction = async (io, actionData) => {
  try {
    const { landRecordId, parcelNumber, action, changed_by, changed_at, administrative_unit_id } = actionData;
    
    // Add action to land record's action_log
    const landRecord = await LandRecord.findByPk(landRecordId);
    if (landRecord) {
      const currentActionLog = Array.isArray(landRecord.action_log) ? landRecord.action_log : [];
      const newAction = {
        action,
        changed_by,
        changed_at: changed_at || new Date().toISOString(),
        timestamp: new Date().toISOString()
      };
      
      currentActionLog.push(newAction);
      
      await landRecord.update({
        action_log: currentActionLog
      });
      
      console.log(`Action logged for record ${landRecordId}: ${action}`);
    }
    
    // Get all users who should be notified about this action
    let usersToNotify;
    if (administrative_unit_id) {
      // Notify users in the same administrative unit
      usersToNotify = await User.findAll({
        where: { 
          administrative_unit_id: administrative_unit_id,
          status: 'active'
        },
        attributes: ['id', 'last_login']
      });
    } else {
      // Notify all active users (for system-wide actions)
      usersToNotify = await User.findAll({
        where: { status: 'active' },
        attributes: ['id', 'last_login']
      });
    }
    
    // Notify each user
    usersToNotify.forEach(user => {
      const socketId = userSockets.get(user.id);
      if (socketId) {
        // Send the real-time notification
        io.to(socketId).emit('new_action_occurred', {
          land_record_id: landRecordId,
          parcel_number: parcelNumber,
          action: action,
          changed_by: changed_by,
          changed_at: changed_at || new Date().toISOString(),
          timestamp: new Date().toISOString()
        });
        
        // Update their new actions count
        sendUserNewActionsCount(io, user.id);
      }
    });
    
    console.log(`Notified ${usersToNotify.length} users about action: ${action}`);
    return usersToNotify.length;
    
  } catch (error) {
    console.error('Error notifying new action:', error);
    throw error;
  }
};

/**
 * Mark user's actions as seen (update last_login)
 */
const markActionsAsSeen = async (userId) => {
  try {
    // Update user's last_login to now (so no more "new" actions)
    await User.update(
      { last_login: new Date() },
      { where: { id: userId } }
    );
    
    console.log(`User ${userId} marked actions as seen`);
    return true;
  } catch (error) {
    console.error('Error marking actions as seen:', error);
    throw error;
  }
};

/**
 * User session management
 */
const userSessionUtils = {
  // Add user to session tracking
  addUserSession: (userId, socketId) => {
    userSockets.set(userId, socketId);
    console.log(`User ${userId} added to sessions with socket ${socketId}`);
  },

  // Remove user from session tracking
  removeUserSession: (userId) => {
    userSockets.delete(userId);
    console.log(`User ${userId} removed from sessions`);
  },

  // Remove user by socket ID
  removeUserSessionBySocketId: (socketId) => {
    for (const [userId, userSocketId] of userSockets.entries()) {
      if (userSocketId === socketId) {
        userSockets.delete(userId);
        console.log(`User ${userId} removed from sessions by socket ID`);
        return userId;
      }
    }
    return null;
  },

  // Get all connected users
  getConnectedUsers: () => {
    return Array.from(userSockets.entries()).map(([userId, socketId]) => ({
      userId,
      socketId
    }));
  },

  // Get user socket ID
  getUserSocket: (userId) => {
    return userSockets.get(userId);
  },

  // Get connected users count
  getConnectedUsersCount: () => {
    return userSockets.size;
  }
};

module.exports = {
  getNewActionsSince,
  getUserNewActionsCount,
  sendUserNewActionsCount,
  sendNewActionsCountToAllUsers,
  notifyNewAction,
  markActionsAsSeen,
  userSessionUtils
};