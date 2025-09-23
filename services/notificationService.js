const { PaymentNotification, PaymentSchedule, LandPayment, LandRecord, PAYMENT_TYPES, NOTIFICATION_TYPES, User, GlobalNoticeSchedule, sequelize } = require('../models');
const { Op } = require('sequelize');
const { sendEmail } = require('../utils/statusEmail');

const createReminderNotifications = async () => {
  const today = new Date();
  const reminderDate = new Date(today);
  reminderDate.setDate(today.getDate() + 7);

  const schedules = await PaymentSchedule.findAll({
    where: {
      is_active: true,
      due_date: {
        [Op.gte]: new Date(reminderDate.setHours(0, 0, 0, 0)),
        [Op.lt]: new Date(reminderDate.setHours(23, 59, 59, 999)),
      },
      related_schedule_id: { [Op.is]: null },
    },
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            include: [
              {
                model: User,
                as: 'owners',
                through: { attributes: [] },
              },
            ],
          },
        ],
      },
    ],
  });

  const notifications = [];
  const transaction = await sequelize.transaction();
  try {
    for (const schedule of schedules) {
      const landPayment = schedule.landPayment;
      const landRecord = landPayment.landRecord;
      const firstOwner = landRecord.owners[0];
      if (!firstOwner) {
        console.log(`በመዝገብ ቁጥር ${landRecord.id} ውስጥ ባለቤት የለም`);
        continue;
      }

      const existingNotification = await PaymentNotification.findOne({
        where: {
          schedule_id: schedule.id,
          notification_type: NOTIFICATION_TYPES.REMINDER,
          delivery_status: { [Op.in]: ['SENT', 'DELIVERED'] },
        },
        transaction,
      });
      if (existingNotification) {
        continue;
      }

      const recipient = {
        user_id: firstOwner.id,
        email: firstOwner.email || null,
        phone: firstOwner.phone || null,
      };
      if (!recipient.email && !recipient.phone) {
        console.log(`መለያ ቁጥር ${firstOwner.id} ያለው ባለቤት ኢሜይል ወይም ስልክ የለውም`);
        continue;
      }

      const message = `የ${landPayment.payment_type} የክፍያ መርሃ ግብር ቁጥር ${schedule.id
        } እስከ ${schedule.due_date.toISOString().split('T')[0]
        } መከፈል አለበት። የገንዘብ መጠን: ${schedule.expected_amount
        } ETB ነው፣ ከዚህ በኋላ ጊዜው ካለፈ ቅጣት ይጨመራል።`;
      const notification = await PaymentNotification.create(
        {
          land_payment_id: landPayment.id,
          schedule_id: schedule.id,
          notification_type: NOTIFICATION_TYPES.REMINDER,
          message,
          recipients: recipient,
          delivery_status: 'SENT',
          description: `የክፍያ መርሃ ግብር ማንቂያ ፣ የመርሃ ግብር ቁጥር:${schedule.id}`,
        },
        { transaction }
      );

      notifications.push(notification);
    }

    await transaction.commit();
    if (notifications.length > 0) {
      console.log(` ${notifications.length} ያክል የክፍያ ማንቂያ ማስታወቂያዎች ተፈጥሯል።`);
    }
    return notifications;
  } catch (error) {
    await transaction.rollback();
    console.error('ማንቂያ ማሳወቂያ መፋጠር ስህተት:', error.message);
    throw error;
  }
};

const createOverdueNotifications = async () => {
  const today = new Date();
  const schedules = await PaymentSchedule.findAll({
    where: {
      is_active: true,
      related_schedule_id: { [Op.is]: null },
    },
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            include: [{ model: User, as: 'owners', through: { attributes: [] } }],
          },
        ],
      },
    ],
  });

  const notifications = [];
  const transaction = await sequelize.transaction();
  try {
    for (const schedule of schedules) {
      const graceEnd = new Date(schedule.due_date);
      graceEnd.setDate(graceEnd.getDate() + schedule.grace_period_days);
      if (today < graceEnd) {
        continue;
      }

      const existingPenalty = await PaymentSchedule.findOne({
        where: { related_schedule_id: schedule.id, is_active: true },
        transaction,
      });
      if (existingPenalty) {
        continue;
      }

      const existingNotification = await PaymentNotification.findOne({
        where: {
          schedule_id: schedule.id,
          notification_type: NOTIFICATION_TYPES.OVERDUE,
          delivery_status: { [Op.in]: ['SENT', 'DELIVERED'] },
        },
        transaction,
      });
      if (existingNotification) {
        continue;
      }

      const landPayment = schedule.landPayment;
      const landRecord = landPayment.landRecord;
      const firstOwner = landRecord.owners[0];
      if (!firstOwner) {
        console.log(`በመዝገብ ቁጥር ${landRecord.id} ውስጥ ባለቤት የለም`);
        continue;
      }

      const recipient = {
        user_id: firstOwner.id,
        email: firstOwner.email || null,
        phone: firstOwner.phone || null,
      };
      if (!recipient.email && !recipient.phone) {
        console.log(`መለያ ቁጥር ${firstOwner.id} ያለው ባለቤት ኢሜይል ወይም ስልክ የለውም`);
        continue;
      }

      const remaining = Number(schedule.expected_amount) - Number(landPayment.paid_amount);
      if (remaining <= 0) {
        continue;
      }

      const overdueDays = Math.floor((today - schedule.due_date) / (1000 * 60 * 60 * 24));
      const message = `የ${landPayment.payment_type} መርሃ ግብር ቁጥር ${schedule.id} ተዘግይቷል። የተረፈ መጠን: ${remaining} ETB፣ የዘገየ ቀናት: ${overdueDays}`;
      const notification = await PaymentNotification.create({
        land_payment_id: landPayment.id,
        schedule_id: schedule.id,
        notification_type: NOTIFICATION_TYPES.OVERDUE,
        message,
        recipients: recipient,
        delivery_status: 'SENT',
        description: `ያለፈበት ማሳወቂያ ለመርሃ ግብር ቁጥር ${schedule.id}`,
      }, { transaction });

      notifications.push(notification);
    }

    await transaction.commit();
    if (notifications.length > 0) {
      console.log(`${notifications.length} ያለፈበት ማሳወቂያዎች ተፈጥሯል`);
    }
    return notifications;
  } catch (error) {
    await transaction.rollback();
    console.error('ያለፈበት ማሳወቂያ መፍጠር ስህተት:', error.message);
    throw error;
  }
};

const createPenaltyNotification = async (penaltySchedule) => {
  const schedule = await PaymentSchedule.findOne({
    where: { id: penaltySchedule.related_schedule_id },
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            include: [
              {
                model: User,
                as: 'owners',
                through: { attributes: [] },
              },
            ],
          },
        ],
      },
    ],
  });

  if (!schedule) {
    throw new Error(`Original schedule ID ${penaltySchedule.related_schedule_id} not found`);
  }

  const landPayment = schedule.landPayment;
  const landRecord = landPayment.landRecord;
  const firstOwner = landRecord.owners[0];
  if (!firstOwner) {
    throw new Error(`የመዝገብ ቁጥር ${landRecord.id} ባለቤት አልተገኘም።`);
  }

  const recipient = {
    user_id: firstOwner.id,
    email: firstOwner.email || null,
    phone: firstOwner.phone || null,
  };
  if (!recipient.email && !recipient.phone) {
    throw new Error(`መለያ ቁጥር ${firstOwner.id} ያለው ባለቤት ኢሜይል ወይም ስልክ የለውም`);
  }

  const message = `የ${landPayment.payment_type} መርሃ ግብር ቁጥር ${schedule.id
    } መዘግየት ምክንያት ቅጣት ተጥሏል። የቅጣት መጠን: ${penaltySchedule.expected_amount
    } ETB፣ መከፈል ያለበት ቀን: ${penaltySchedule.due_date.toISOString().split('T')[0]}`;
  const notification = await PaymentNotification.create({
    land_payment_id: penaltySchedule.land_payment_id,
    schedule_id: penaltySchedule.id,
    notification_type: NOTIFICATION_TYPES.PENALTY,
    message,
    recipients: recipient,
    delivery_status: 'SENT',
    description: `Penalty for overdue schedule ${schedule.id}`,
  });

  return notification;
};

const createConfirmationNotification = async (landPayment) => {
  const schedule = await PaymentSchedule.findOne({
    where: { land_payment_id: landPayment.id, is_active: true },
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            include: [
              {
                model: User,
                as: 'owners',
                through: { attributes: [] },
              },
            ],
          },
        ],
      },
    ],
  });

  if (!schedule) {
    throw new Error(`የክፍያ መለያ ቁጥር ${landPayment.id} የሚገኝ መርሃ ግብር አልተገኘም።`);
  }

  const landRecord = landPayment.landRecord;
  const firstOwner = landRecord.owners[0];
  if (!firstOwner) {
    throw new Error(`መዝገብ ቁጥር ${landRecord.id} ውስጥ ባለቤት የለም`);
  }

  const recipient = {
    user_id: firstOwner.id,
    email: firstOwner.email || null,
    phone: firstOwner.phone || null,
  };
  if (!recipient.email && !recipient.phone) {
    throw new Error(`መለያ ቁጥር ${firstOwner.id} ያለው ባለቤት ኢሜይል ወይም ስልክ የለውም`);
  }

  const message = `የ${landPayment.payment_type} ክፋይ ቁጥር ${landPayment.id
    } ተከፍሏል። የተከፈለ መጠን: ${landPayment.paid_amount} ETB፣ ቀን: ${new Date().toISOString().split('T')[0]
    }`;
  const notification = await PaymentNotification.create({
    land_payment_id: landPayment.id,
    schedule_id: schedule.id,
    notification_type: NOTIFICATION_TYPES.CONFIRMATION,
    message,
    recipients: recipient,
    delivery_status: 'SENT',
    description: `የክፍያ ማረጋገጫ ለ ክፍያ ቁጥር ${landPayment.id}`,
  });

  return notification;
};
const createGlobalNoticeNotifications = async () => {
  const today = new Date();
  const notices = await GlobalNoticeSchedule.findAll({
    where: {
      is_active: true,
      scheduled_date: {
        [Op.gte]: new Date(today.setHours(0, 0, 0, 0)),
        [Op.lt]: new Date(today.setHours(23, 59, 59, 999)),
      },
    },
  });

  const notifications = [];
  const transaction = await sequelize.transaction();
  try {
    for (const notice of notices) {
      const landowners = await User.findAll({
        include: [
          {
            model: LandRecord,
            as: 'landRecords',
            through: { attributes: [] },
          },
        ],
      });

      for (const user of landowners) {
        if (!user.landRecords || user.landRecords.length === 0) {
          continue;
        }
        if (!user.email) {
          console.log(`መለያ ቁጥር ${user.id} ያለው ባለቤት ኢሜይል የለውም`);
          continue;
        }

        const existingNotification = await PaymentNotification.findOne({
          where: {
            global_notice_schedule_id: notice.id,
            notification_type: NOTIFICATION_TYPES.GLOBAL_NOTICE,
            recipients: { [Op.contains]: { user_id: user.id } },
            delivery_status: { [Op.in]: ['SENT', 'DELIVERED'] },
          },
          transaction,
        });
        if (existingNotification) {
          continue;
        }

        const recipient = {
          user_id: user.id,
          email: user.email,
          phone: null, // Email only for global notices
        };

        const notification = await PaymentNotification.create({
          global_notice_schedule_id: notice.id,
          notification_type: NOTIFICATION_TYPES.GLOBAL_NOTICE,
          message: notice.message,
          recipients: recipient,
          delivery_status: 'PENDING',
          description: `አጠቃላይ ማሳወቂያ ለባለቤት ቁጥር ${user.id}`,
        }, { transaction });

        notifications.push(notification);
      }

      await notice.update({ is_active: false }, { transaction });
    }

    await transaction.commit();
    if (notifications.length > 0) {
      console.log(`${notifications.length} አጠቃላይ ማሳወቂያዎች ተፈጥሯል`);
    }
    return notifications;
  } catch (error) {
    await transaction.rollback();
    console.error('አጠቃላይ ማሳወቂያ መፍጠር ስህተት:', error.message);
    throw error;
  }
};

const sendPendingNotifications = async () => {
  const notifications = await PaymentNotification.findAll({
    where: { delivery_status: 'PENDING' },
  });

  let sentCount = 0;
  for (const notification of notifications) {
    try {
      if (notification.recipients.email) {
        await sendEmail({
          to: notification.recipients.email,
          subject: notification.notification_type === NOTIFICATION_TYPES.GLOBAL_NOTICE
            ? 'ማስታዎቂያ'
            : `Land Payment Notification: ${notification.notification_type}`,
          html: `
            <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 24px;">
              <div style="max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px;">
          <h2 style="color: #2e7d32; margin-bottom: 16px;">
            ${notification.notification_type === NOTIFICATION_TYPES.GLOBAL_NOTICE ? 'ማስታዎቂያ' : 'Land Payment Notification'}
          </h2>
          <p style="font-size: 16px; color: #333; line-height: 1.6;">
            ${notification.message}
          </p>
          <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 13px; color: #888;">
            ይህ መልእክት ከከተማ ልማት አገልግሎት ተልኳል<br>
            This message was sent by City Development Service.
          </p>
              </div>
            </div>
          `,
        });
        console.log(
          `Email sent for notification ID ${notification.id} to ${notification.recipients.email}: ${notification.message}`
        );
      } else {
        console.log(
          `No email for notification ID ${notification.id}, logging only: ${notification.message} to ${JSON.stringify(notification.recipients)}`
        );
      }

      await notification.update({
        delivery_status: 'DELIVERED',
        sent_date: new Date(),
      });
      sentCount++;
    } catch (error) {
      console.error(
        `Failed to send notification ID ${notification.id}:`,
        error.message
      );
      await notification.update({ delivery_status: 'FAILED' });
    }
  }

  return sentCount;
};

module.exports = {
  createReminderNotifications,
  createOverdueNotifications,
  createPenaltyNotification,
  createConfirmationNotification,
  createGlobalNoticeNotifications,
  sendPendingNotifications,
};