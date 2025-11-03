// utils/notificationUtils.js
const { Op } = require("sequelize");
const { LandRecord, User, PushNotification, Role, Document, ActionLog } = require("../models");

// Store user sessions
const userSockets = new Map();

/**
 * Create ActionLog and generate notifications for relevant users
 */
const notifyNewAction = async (io, actionData) => {
  
  try {
    
    const { 
      landRecordId, 
      parcelNumber, 
      action_type,
      performed_by, 
      changed_at = new Date().toISOString(), 
      administrative_unit_id, 
      notes = '',
      additional_data = {} 
    } = actionData;


    // Validate required fields for ActionLog
    if (!action_type || !performed_by) {
      throw new Error("ActionLog.action_type and performed_by are required");
    }

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

    // 1. FIRST CREATE ACTION LOG
    const actionLog = await ActionLog.create({
      land_record_id: landRecordId,
      performed_by: performed_by,
      action_type: action_type,
      notes: notes,
      additional_data: {
        ...additional_data,
        plot_number: plotNumber,
        parcel_number: parcelNumber || landRecord?.parcel_number
      }
    });

    // 2. THEN CREATE NOTIFICATIONS FOR RELEVANT USERS
    const usersToNotify = await getUsersToNotify(administrative_unit_id || landRecord?.administrative_unit_id);

    // Create push notification records for each user
    const notificationPromises = usersToNotify.map(async (user) => {
      const { title, message } = generateNotificationContent(action_type, parcelNumber || landRecord?.parcel_number, additional_data, plotNumber);
      
      return await PushNotification.create({
        user_id: user.id,
        land_record_id: landRecordId,
        action_log_id: actionLog.id, 
        title: title,
        message: message,
        action_type: action_type,
        is_seen: false,
        additional_data: {
          action_log_id: actionLog.id, 
          ...additional_data,
          plot_number: plotNumber 
        }
      });
    });

    const createdNotifications = await Promise.all(notificationPromises);

    // 3. SEND REAL-TIME UPDATES
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
            parcel_number: parcelNumber || landRecord?.parcel_number,
            plot_number: plotNumber, 
            land_record_id: landRecordId,
            action_log_id: actionLog.id, // Include ActionLog ID
            is_seen: userNotification.is_seen,
            created_at: userNotification.created_at,
            additional_data: userNotification.additional_data
          });
          
          sendUserUnseenCount(io, user.id);
          notifiedCount++;
        }
      }
    });

    return { actionLog, notifiedCount };
    
  } catch (error) {
    throw error;
  }
};

/**
 * Get users to notify based on administrative unit and roles
 */
const getUsersToNotify = async (administrative_unit_id) => {
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
  return await User.findAll({
    where: userWhereClause,
    include: [{
      model: Role,
      as: 'role',
      attributes: ['id', 'name']
    }],
    attributes: ['id', 'first_name', "middle_name", 'last_name', 'administrative_unit_id']
  });
};

/**
 * Helper function to generate notification title and message
 */
const generateNotificationContent = (action_type, parcelNumber, additionalData, plotNumber = null) => {
  const identifier = plotNumber ? `የካርታ ቁጥር ${plotNumber}` : `ፓርሰል ${parcelNumber}`;
  const changedByName = additionalData?.changed_by_name || 'ያልታወቀ ተጠቃሚ';
  
  // Handle different action types
  if (action_type === 'RECORD_CREATED') {
    const ownersCount = additionalData?.owners_count || 0;
    
    let message = `አዲስ የመሬት መዝገብ ተፈጥሯል - ${identifier}`;
    message += `\nየባለቤቶች ብዛት: ${ownersCount}`;
    message += `\nየመጀመሪያ ሁኔታ: ${additionalData?.status || 'ረቂቅ'}`;
    message += `\n(በ${changedByName} ተፈጥሯል)`;
    
    return {
      title: `አዲስ የመሬት መዝገብ ተፈጥሯል - ${identifier}`,
      message: message
    };
  }
  
  // Handle status changes - UPDATED FOR NEW ACTION TYPES
  if (action_type.startsWith('STATUS_')) {
    const status = action_type.replace('STATUS_', '');
    const statusMap = {
      'SUBMITTED': 'ተልኳል',
      'UNDER_REVIEW': 'በግምገማ ላይ', 
      'APPROVED': 'ጸድቋል',
      'REJECTED': 'ውድቅ ተደርጓል'
    };
    const statusText = statusMap[status] || status;
    const previousStatus = additionalData?.previous_status || '';
    
    let message = `የ${identifier} መሬት መዝገብ ሁኔታ`;
    if (previousStatus) {
      const previousStatusText = statusMap[previousStatus] || previousStatus;
      message += ` ከ "${previousStatusText}" ወደ "${statusText}" ተቀይሯል።`;
    } else {
      message += ` ወደ "${statusText}" ተቀይሯል።`;
    }
    
    // Add additional context if available
    if (additionalData?.rejection_reason) {
      message += `\nምክንያት: ${additionalData.rejection_reason}`;
    } else if (additionalData?.notes) {
      message += `\nማስታወሻ: ${additionalData.notes}`;
    } else if (additionalData.filelength){
      message += `\nማስታወሻ: ${additionalData.filelength}`;
    }
    
    message += `\n(በ${changedByName} ተቀይሯል)`;
    
    return {
      title: `የመሬት መዝገብ ሁኔታ ተቀይሯል - ${identifier} | ${statusText}`,
      message: message
    };
  }
  
  // Record updates
  if (action_type === 'RECORD_UPDATED') {
    return {
      title: `የመሬት መዝገብ ተቀይሯል - ${identifier}`,
      message: `የ${identifier} መሬት መዝገብ ታሪፍ ተቀይሯል። (በ${changedByName})`
    };
  }
  
  // Default fallback
  return {
    title: `የስርአት ማሳወቂያ - ${identifier}`,
    message: `በ${identifier} መሬት መዝገብ ላይ እንቅስቃሴ ተካሂዷል። (በ${changedByName})`
  };
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
        {
          model: ActionLog,
          as: "actionLog",
          attributes: ["id", "action_type", "notes", "additional_data", "created_at"],
          include: [{
            model: User,
            as: "performedBy",
            attributes: ["first_name", "middle_name", "last_name"]
          }]
        }
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