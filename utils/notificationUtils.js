const { Op } = require("sequelize");
const { LandRecord, User, PushNotification, Role, Document } = require("../models");

// Store user sessions
const userSockets = new Map();

/**
 * Create notifications for relevant users when an action occurs
 */
const notifyNewAction = async (io, actionData) => {
  try {
    const { landRecordId, parcelNumber, action, changed_by, changed_at, administrative_unit_id, additional_data } = actionData;
    
    // Get the land record with associated documents to extract plot_number
    const landRecord = await LandRecord.findByPk(landRecordId, {
      include: [{
        model: Document,
        as: 'documents', 
        attributes: ['plot_number']
      }]
    });
    
    // Extract plot_number from the first document (if exists)
    const plotNumber = landRecord?.documents?.[0]?.plot_number || null;
    
    // Build the where clause for users
    const userWhereClause = {
      is_active: true,
      [Op.or]: [
        // Users in the same administrative unit
        ...(administrative_unit_id ? [{ administrative_unit_id }] : []),
        // Users with specific roles (መዝጋቢ and አስተዳደር)
        {
          '$role.name$': {
            [Op.in]: ['መዝጋቢ', 'አስተዳደር']
          }
        }
      ]
    };

    // If no administrative_unit_id, remove the empty array condition
    if (!administrative_unit_id) {
      userWhereClause[Op.or] = userWhereClause[Op.or].filter(condition => 
        !condition.administrative_unit_id
      );
    }

    // Get all users to notify in one query
    const usersToNotify = await User.findAll({
      where: userWhereClause,
      include: [{
        model:Role,
        as: 'role',
        attributes: ['id', 'name']
      }],
      attributes: ['id', 'first_name',"middle_name",'last_name', 'administrative_unit_id']
    });

    // Create push notification records for each user
    const notificationPromises = usersToNotify.map(async (user) => {
      const title = getNotificationTitle(action, parcelNumber, plotNumber);
      const message = getNotificationMessage(action, parcelNumber, additional_data, plotNumber);
      
      return await PushNotification.create({
        user_id: user.id,
        land_record_id: landRecordId,
        title: title,
        message: message,
        action_type: action,
        is_seen: false,
        additional_data: {
          ...additional_data,
          plot_number: plotNumber 
        }
      });
    });

    const createdNotifications = await Promise.all(notificationPromises);

    // Send real-time updates to connected users
    let notifiedCount = 0;
    usersToNotify.forEach(user => {
      const socketId = userSockets.get(user.id);
      if (socketId) {
        const userNotification = createdNotifications.find(n => n.user_id === user.id);
        
        if (userNotification) {
          io.to(socketId).emit('new_action_occurred', {
            id: userNotification.id,
            title: userNotification.title,
            message: userNotification.message,
            action_type: userNotification.action_type,
            parcel_number: parcelNumber,
            plot_number: plotNumber, 
            land_record_id: landRecordId,
            is_seen: userNotification.is_seen,
            created_at: userNotification.created_at,
            additional_data: userNotification.additional_data
          });
          
          sendUserUnseenCount(io, user.id);
          notifiedCount++;
        }
      }
    });

    return notifiedCount;
    
  } catch (error) {
    throw error;
  }
};

/**
 * Get user's unseen notifications count
 */
const getUserUnseenCount = async (userId) => {
  try {
    const count = await PushNotification.count({
      where: {
        user_id: userId,
        is_seen: false,
      },
    });
    return count;
  } catch (error) {
    return 0;
  }
};

/**
 * Get user's notifications 
 */
const getUserNotifications = async (userId, limit = 20, offset = 0) => {
  try {
    const notifications = await PushNotification.findAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit: limit,
      offset: offset,
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
      ],
    });
    return notifications;
  } catch (error) {
    return [];
  }
};

/**
 * Mark notifications as seen
 */
const markNotificationsAsSeen = async (userId, notificationIds = null) => {
  try {
    const whereClause = { user_id: userId, is_seen: false };

    if (notificationIds && notificationIds.length > 0) {
      whereClause.id = { [Op.in]: notificationIds };
    }

    const result = await PushNotification.update(
      { is_seen: true },
      { where: whereClause }
    );

    return result[0];
  } catch (error) {
    throw error;
  }
};

/**
 * Send unseen count to a specific user
 */
const sendUserUnseenCount = async (io, userId) => {
  try {
    const count = await getUserUnseenCount(userId);
    io.to(`user_${userId}`).emit("unseen_count_update", { count });
    return count;
  } catch (error) {
    io.to(`user_${userId}`).emit("unseen_count_update", { count: 0 });
    return 0;
  }
};

/**
 * Helper function to generate notification title
 */
const getNotificationTitle = (action, parcelNumber, plotNumber = null) => {
  const identifier = plotNumber ? `የካርታ ቁጥር ${plotNumber}` : `Parcel ${parcelNumber}`;
  
  // Handle different action types
  if (action === 'RECORD_CREATED') {
    return `አዲስ የመሬት መዝገብ ተፈጥሯል - ${identifier}`;
  }
  
  // Handle status changes
  if (action.startsWith('STATUS_CHANGED_TO_')) {
    const status = action.replace('STATUS_CHANGED_TO_', '');
    return `የመሬት መዝገብ ሁኔታ ተቀይሯል - ${identifier} | ${status}`;
  }
  
  // Default fallback
  return `የስርአት ማሳወቂያ - ${identifier}`;
};

/**
 * Helper function to generate notification message
 */
const getNotificationMessage = (action, parcelNumber, additionalData, plotNumber = null) => {
  const identifier = plotNumber ? `የካርታ ቁጥር ${plotNumber}` : `ፓርሰል ${parcelNumber}`;
  const changedByName = additionalData?.changed_by_name || 'ያልታወቀ ተጠቃሚ';
  
  // Handle different action types
  if (action === 'RECORD_CREATED') {
    const ownersCount = additionalData?.owners_count || 0;
    
    let message = `አዲስ የመሬት መዝገብ ተፈጥሯል - ${identifier}`;
    message += `\nየባለቤቶች ብዛት: ${ownersCount}`;
    message += `\nየመጀመሪያ ሁኔታ: ${additionalData?.status || 'ረቂቅ'}`;
    message += `\n(በ${changedByName} ተፈጥሯል)`;
    
    return message;
  }
  
  // Handle status changes
  if (action.startsWith('STATUS_CHANGED_TO_')) {
    const status = action.replace('STATUS_CHANGED_TO_', '');
    const previousStatus = additionalData?.previous_status || '';
    
    let message = `የ${identifier} መሬት መዝገብ ሁኔታ ከ "${previousStatus}" ወደ "${status}" ተቀይሯል።`;
    
    // Add additional context if available
    if (additionalData?.rejection_reason) {
      message += `\nምክንያት: ${additionalData.rejection_reason}`;
    } else if (additionalData?.notes) {
      message += `\nማስታወሻ: ${additionalData.notes}`;
    } else if (additionalData.filelength){
      message +=`\nማስታወሻ: ${additionalData.filelength}`;
    }
    
    message += `\n(በ${changedByName} ተቀይሯል)`;
    
    return message;
  }
  
  // Default fallback
  return `በ${identifier} መሬት መዝገብ ላይ እንቅስቃሴ ተካሂዷል። (በ${changedByName})`;
};

/**
 * User session management
 */
const userSessionUtils = {
  addUserSession: (userId, socketId) => {
    userSockets.set(userId, socketId);
  },

  removeUserSession: (userId) => {
    userSockets.delete(userId);
  },

  removeUserSessionBySocketId: (socketId) => {
    for (const [userId, userSocketId] of userSockets.entries()) {
      if (userSocketId === socketId) {
        userSockets.delete(userId);
        return userId;
      }
    }
    return null;
  },

  getConnectedUsers: () => {
    return Array.from(userSockets.entries()).map(([userId, socketId]) => ({
      userId,
      socketId,
    }));
  },

  getUserSocket: (userId) => {
    return userSockets.get(userId);
  },

  getConnectedUsersCount: () => {
    return userSockets.size;
  },
};

module.exports = {
  notifyNewAction,
  getUserUnseenCount,
  getUserNotifications,
  markNotificationsAsSeen,
  sendUserUnseenCount,
  userSessionUtils,
};
