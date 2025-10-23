const { Op } = require("sequelize");
const { LandRecord, User, PushNotification, Role } = require("../models");

// Store user sessions
const userSockets = new Map();

/**
 * Create notifications for relevant users when an action occurs
 */
const notifyNewAction = async (io, actionData) => {
  try {
    const {
      landRecordId,
      parcelNumber,
      action,
      changed_by,
      changed_at,
      administrative_unit_id,
      additional_data,
    } = actionData;

    // Build the where clause for users
    const userWhereClause = {
      is_active: true,
      [Op.or]: [
        // Users in the same administrative unit
        ...(administrative_unit_id ? [{ administrative_unit_id }] : []),
        // Users with specific roles (መዝጋቢ and አስተዳደር)
        {
          "$role.name$": {
            [Op.in]: ["መዝጋቢ", "አስተዳደር"],
          },
        },
      ],
    };

    // If no administrative_unit_id, remove the empty array condition
    if (!administrative_unit_id) {
      userWhereClause[Op.or] = userWhereClause[Op.or].filter(
        (condition) => !condition.administrative_unit_id
      );
    }

    // Get all users to notify in one query
    const usersToNotify = await User.findAll({
      where: userWhereClause,
      include: [
        {
          model: Role,
          as: "role",
          attributes: ["id", "name"],
        },
      ],
      attributes: [
        "id",
        "first_name",
        "middle_name",
        "last_name",
        "administrative_unit_id",
      ],
    });

    // Create push notification records for each user
    const notificationPromises = usersToNotify.map(async (user) => {
      const title = getNotificationTitle(action, parcelNumber);
      const message = getNotificationMessage(
        action,
        parcelNumber,
        additional_data
      );

      return await PushNotification.create({
        user_id: user.id,
        land_record_id: landRecordId,
        title: title,
        message: message,
        action_type: action,
        is_seen: false,
        additional_data: additional_data,
      });
    });

    const createdNotifications = await Promise.all(notificationPromises);

    // Send real-time updates to connected users
    let notifiedCount = 0;
    usersToNotify.forEach((user) => {
      const socketId = userSockets.get(user.id);
      if (socketId) {
        // Find the notification for this user
        const userNotification = createdNotifications.find(
          (n) => n.user_id === user.id
        );

        if (userNotification) {
          // Send real-time notification
          io.to(socketId).emit("new_action_occurred", {
            id: userNotification.id,
            title: userNotification.title,
            message: userNotification.message,
            action_type: userNotification.action_type,
            parcel_number: parcelNumber,
            land_record_id: landRecordId,
            is_seen: userNotification.is_seen,
            created_at: userNotification.created_at,
            additional_data: userNotification.additional_data,
          });

          // Update their unseen count
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
const getNotificationTitle = (action, parcelNumber) => {
  const titles = {
    RECORD_CREATED: `New Land Record Created - ${parcelNumber}`,
    STATUS_APPROVED: `Record Approved - ${parcelNumber}`,
    STATUS_REJECTED: `Record Rejected - ${parcelNumber}`,
    STATUS_UNDER_REVIEW: `Record Under Review - ${parcelNumber}`,
    STATUS_SUBMITTED: `Record Submitted - ${parcelNumber}`,
    "STATUS_በግምገማ ላይ": `Record Under Review - ${parcelNumber}`,
    STATUS_ጸድቋል: `Record Approved - ${parcelNumber}`,
    "STATUS_ውድቅ ተደርጓል": `Record Rejected - ${parcelNumber}`,
  };
  return titles[action] || `System Update - ${parcelNumber}`;
};

/**
 * Helper function to generate notification message
 */
const getNotificationMessage = (action, parcelNumber, additionalData) => {
  const messages = {
    RECORD_CREATED: `A new land record ${parcelNumber} has been created in the system.`,
    STATUS_APPROVED: `Land record ${parcelNumber} has been approved.`,
    STATUS_REJECTED: `Land record ${parcelNumber} has been rejected. ${
      additionalData?.rejection_reason
        ? `Reason: ${additionalData.rejection_reason}`
        : ""
    }`,
    STATUS_UNDER_REVIEW: `Land record ${parcelNumber} is now under review.`,
    STATUS_SUBMITTED: `Land record ${parcelNumber} has been submitted for review.`,
    "STATUS_በግምገማ ላይ": `Land record ${parcelNumber} is now under review.`,
    STATUS_ጸድቋል: `Land record ${parcelNumber} has been approved.`,
    "STATUS_ውድቅ ተደርጓል": `Land record ${parcelNumber} has been rejected. ${
      additionalData?.rejection_reason
        ? `Reason: ${additionalData.rejection_reason}`
        : ""
    }`,
  };
  return messages[action] || `Action performed on land record ${parcelNumber}`;
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
