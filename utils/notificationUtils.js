// utils/notificationUtils.js
const { Op } = require("sequelize");
const { LandRecord, User, PushNotification, Role, Document, ActionLog } = require("../models");

// Store user sessions
const userSockets = new Map();

/**
 * Get users to notify based on action type, roles, and administrative unit
 */
const getUsersToNotify = async (action_type, administrative_unit_id, performed_by) => {
  // Define notification rules based on action type
  const notificationRules = {
    // Record creation - notify admins and registrars in the same administrative unit
    'RECORD_CREATED': {
      roles: ['አስተዳደር', 'መዝጋቢ'],
      sameUnit: true,
      excludePerformer: true
    },
    // Status changes - notify based on the specific status
    'STATUS_SUBMITTED': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    'STATUS_UNDER_REVIEW': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    'STATUS_APPROVED': {
      roles: ['መዝጋቢ', 'አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    'STATUS_REJECTED': {
      roles: ['መዝጋቢ'],
      sameUnit: true,
      excludePerformer: true
    },
    // Document actions
    'DOCUMENT_CREATED': {
      roles: ['አስተዳደር', 'መዝጋቢ'],
      sameUnit: true,
      excludePerformer: true
    },
    'DOCUMENT_UPDATED': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    // Payment actions
    'PAYMENT_CREATED': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    'PAYMENT_UPDATED': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    // Record updates
    'RECORD_UPDATED': {
      roles: ['አስተዳደር'],
      sameUnit: true,
      excludePerformer: true
    },
    // Default - notify admins and registrars
    'DEFAULT': {
      roles: ['አስተዳደር', 'መዝጋቢ'],
      sameUnit: true,
      excludePerformer: true
    }
  };

  // Get the rule for this action type, fallback to default
  const rule = notificationRules[action_type] || notificationRules.DEFAULT;

  // Build the where clause for users
  const userWhereClause = {
    is_active: true,
    [Op.and]: []
  };

  // Add role condition
  userWhereClause[Op.and].push({
    '$role.name$': {
      [Op.in]: rule.roles
    }
  });

  // Add administrative unit condition if required
  if (rule.sameUnit && administrative_unit_id) {
    userWhereClause[Op.and].push({
      administrative_unit_id: administrative_unit_id
    });
  }

  // Exclude the performer if configured
  if (rule.excludePerformer && performed_by) {
    userWhereClause[Op.and].push({
      id: {
        [Op.ne]: performed_by
      }
    });
  }

  // Get all users to notify
  const users = await User.findAll({
    where: userWhereClause,
    include: [{
      model: Role,
      as: 'role',
      attributes: ['id', 'name']
    }],
    attributes: ['id', 'first_name', 'middle_name', 'last_name', 'administrative_unit_id', 'role_id']
  });

  return users;
};

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

    // 2. THEN CREATE NOTIFICATIONS FOR RELEVANT USERS (ENHANCED)
    const usersToNotify = await getUsersToNotify(
      action_type, 
      administrative_unit_id || landRecord?.administrative_unit_id, 
      performed_by
    );

    console.log(`🔔 Notifying ${usersToNotify.length} users for action: ${action_type}`);
    console.log(`🔔 Users:`, usersToNotify.map(u => ({
      id: u.id, 
      name: `${u.first_name} ${u.middle_name || ''} ${u.last_name}`.trim(),
      role: u.role?.name
    })));

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
          plot_number: plotNumber,
          target_user_role: user.role?.name // Add target user role for context
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
            action_log_id: actionLog.id,
            is_seen: userNotification.is_seen,
            created_at: userNotification.created_at,
            additional_data: userNotification.additional_data
          });
          
          sendUserUnseenCount(io, user.id);
          notifiedCount++;
        }
      }
    });

    return { actionLog, notifiedCount, usersNotified: usersToNotify.length };
    
  } catch (error) {
    console.error("notifyNewAction error:", error);
    throw error;
  }
};

/**
 * Helper function to generate notification title and message
 */
const generateNotificationContent = (action_type, parcelNumber, additionalData, plotNumber = null) => {
  const identifier = plotNumber ? `የካርታ ቁጥር ${plotNumber}` : `ፓርሰል ${parcelNumber}`;
  const changedByName = additionalData?.changed_by_name || 'ያልታወቀ ተጠቃሚ';
  
  const contentTemplates = {
    'RECORD_CREATED': {
      title: 'አዲስ የመሬት መዝገብ ተፈጥሯል',
      message: `አዲስ የመሬት መዝገብ ተጨምሯል - ${identifier}\nየባለቤቶች ብዛት: ${additionalData?.owners_count || 0}\n(በ${changedByName} ተፈጥሯል)`
    },
    'STATUS_SUBMITTED': {
      title: 'የመሬት መዝገብ ቀርቧል',
      message: `የ${identifier} መሬት መዝገብ ለግምገማ ቀርቧል\n(በ${changedByName} ቀርቧል)`
    },
    'STATUS_UNDER_REVIEW': {
      title: 'የመሬት መዝገብ በግምገማ ላይ',
      message: `የ${identifier} መሬት መዝገብ ለግምገማ ቀርቧል\n(በ${changedByName} ቀርቧል)`
    },
    'STATUS_APPROVED': {
      title: 'የመሬት መዝገብ ጸድቋል',
      message: `የ${identifier} መሬት መዝገብ ተጸድቋል${additionalData?.notes ? `\nማስታወሻ: ${additionalData.notes}` : ''}\n(በ${changedByName} ተጸድቋል)`
    },
    'STATUS_REJECTED': {
      title: 'የመሬት መዝገብ ውድቅ ተደርጓል',
      message: `የ${identifier} መሬት መዝገብ ውድቅ ተደርጓል${additionalData?.rejection_reason ? `\nምክንያት: ${additionalData.rejection_reason}` : ''}\n(በ${changedByName} ውድቅ ተደርጓል)`
    },
    'DOCUMENT_CREATED': {
      title: 'አዲስ ሰነድ ተጨምሯል',
      message: `አዲስ ሰነድ ተጨምሯል - ${identifier}\nየሰነድ አይነት: ${additionalData?.document_type || 'ማይታወቅ'}\n(በ${changedByName} ተጨምሯል)`
    },
    'PAYMENT_CREATED': {
      title: 'አዲስ ክፍያ ተጨምሯል',
      message: `አዲስ ክፍያ ተጨምሯል - ${identifier}\nጠቅላላ መጠን: ${additionalData?.total_amount || 0} ${additionalData?.currency || 'ETB'}\n(በ${changedByName} ተጨምሯል)`
    }
  };

  const content = contentTemplates[action_type] || {
    title: 'የመሬት መዝገብ ለውጥ',
    message: `በ${identifier} መሬት መዝገብ ላይ ለውጥ ተደርጓል። (በ${changedByName})`
  };

  return content;
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