const { PaymentNotification, PaymentSchedule, LandPayment, LandRecord, PAYMENT_TYPES, NOTIFICATION_TYPES, User, GlobalNoticeSchedule, sequelize, Sequelize, PAYMENT_STATUSES, AdministrativeUnit } = require('../models');
const { Op } = require('sequelize');
const { sendEmail } = require('../utils/statusEmail');
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const createReminderNotifications = async () => {
  const today = new Date();
  
  // Multiple reminder intervals (days before due date)
  const reminderIntervals = [30, 15, 7, 3, 1];
  
  const notifications = [];
  const transaction = await sequelize.transaction();
  
  try {
    for (const daysBefore of reminderIntervals) {
      const reminderDate = new Date(today);
      reminderDate.setDate(today.getDate() + daysBefore);
      
      // Create start and end of the target date
      const startOfReminderDate = new Date(reminderDate);
      startOfReminderDate.setHours(0, 0, 0, 0);
      
      const endOfReminderDate = new Date(reminderDate);
      endOfReminderDate.setHours(23, 59, 59, 999);

      console.log(`Checking schedules due in ${daysBefore} days (${startOfReminderDate.toISOString()})`);

      const schedules = await PaymentSchedule.findAll({
        where: {
          is_active: true,
          due_date: {
            [Op.between]: [startOfReminderDate, endOfReminderDate],
          },
        },
        include: [
          {
            model: LandPayment,
            as: 'landPayment',
            required: true,
            where: {
              payment_status: PAYMENT_STATUSES.PENDING, 
            },
            include: [
              {
                model: LandRecord,
                as: 'landRecord',
                required: true,
                include: [
                  {
                    model: User,
                    as: 'owners',
                    through: { attributes: [] },
                    required: true,
                  },
                  {
                    model: AdministrativeUnit,
                    as: 'administrativeUnit',
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
        transaction,
      });

      console.log(`Found ${schedules.length} schedules due in ${daysBefore} days`);

      for (const schedule of schedules) {
        const landPayment = schedule.landPayment;
        const landRecord = landPayment.landRecord;
        const firstOwner = landRecord.owners[0];
        const adminUnit = landRecord.administrativeUnit;
        
        if (!firstOwner) {
          console.warn(`⏭️ Schedule ${schedule.id}: No owner found, skipping`);
          continue;
        }

        if (!adminUnit) {
          console.warn(`⏭️ Schedule ${schedule.id}: No administrative unit found, skipping`);
          continue;
        }

        // Check if reminder already sent for this interval
        const existingNotification = await PaymentNotification.findOne({
          where: {
            schedule_id: schedule.id,
            notification_type: NOTIFICATION_TYPES.REMINDER,
            reminder_days_before: daysBefore,
            delivery_status: { [Op.in]: ['SENT', 'DELIVERED'] },
          },
          transaction,
        });

        if (existingNotification) {
          console.log(`⏭️ Schedule ${schedule.id}: Reminder already sent for ${daysBefore} days before, skipping`);
          continue;
        }

        const recipient = {
          user_id: firstOwner.id,
          email: firstOwner.email || null,
          phone: firstOwner.phone || null,
        };

        if (!recipient.email && !recipient.phone) {
          console.warn(`⏭️ Schedule ${schedule.id}: No email or phone for owner, skipping`);
          continue;
        }

        // Enhanced message template with all context
        const dueDateFormatted = schedule.due_date.toLocaleDateString('am-ET');
        const amount = schedule.expected_amount.toLocaleString('en-ET');
        const payerName =firstOwner.first_name && firstOwner.middle_name;
        const adminUnitName = adminUnit.name;
        const paymentType = landPayment.payment_type;
        
        // Include land record context for more detailed messages
        const landRecordInfo = {
          landUse: landRecord.land_use,
          area: landRecord.area
        };

        const message = getReminderMessage(
          schedule, 
          daysBefore, 
          dueDateFormatted, 
          amount,
          paymentType,
          payerName,
          adminUnitName,
          landRecordInfo
        );

        const notification = await PaymentNotification.create(
          {
            land_payment_id: landPayment.id,
            schedule_id: schedule.id,
            notification_type: NOTIFICATION_TYPES.REMINDER,
            message,
            recipients: recipient,
            delivery_status: 'PENDING', 
            reminder_days_before: daysBefore,
            description: `የክፍያ መርሃ ግብር ማንቂያ (${daysBefore} ቀናት ቀደምት) - የመርሃ ግብር ቁጥር: ${schedule.id}`,
            metadata: {
              reminder_type: `${daysBefore}_days_before`,
              due_date: schedule.due_date,
              expected_amount: schedule.expected_amount,
              payment_type: paymentType,
              payer_name: payerName,
              administrative_unit: adminUnitName,
              land_use: landRecord.land_use,
              land_area: landRecord.area,
              land_preparation: landRecord.land_preparation,
              admin_unit_id: adminUnit.id
            }
          },
          { transaction }
        );

        notifications.push(notification);
        console.log(`✅ Created reminder notification for schedule ${schedule.id} (${daysBefore} days before) - ${paymentType} - ${payerName}`);
      }
    }

    await transaction.commit();
    console.log(`🎯 Reminder creation completed: ${notifications.length} notifications created`);
    return notifications;
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Reminder creation transaction failed:', error);
    throw error;
  }
};

// Helper function for message templates
const getReminderMessage = (schedule, daysBefore, dueDateFormatted, amount, paymentType, payerName, adminUnitName) => {
  // Payment type translations
  const paymentTypeAmharic = {
    'TAX': 'ግብር',
    'LEASE_PAYMENT': 'ሊዝ',
    'LEASE': 'ሊዝ'
  };

  const paymentTypeText = paymentTypeAmharic[paymentType] || paymentType;
  
  // Format payer name for greeting
  const greetingName = payerName ? ` ${payerName}` : ' ተጠቃሚ';

  const messages = {
    30: `ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ በ${dueDateFormatted} (ከ30 ቀናት በኋላ) መክፈል አለበት። 
የክፍያ መጠን፡ ${amount} ብር።

ለማንኛውም ጥያቄ ከ${adminUnitName} አስተዳደራዊ ክፍል ያነጋግሩ።

ከሰላምታ ጋር፣
${adminUnitName}`,

    15: `ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ በ${dueDateFormatted} (ከ15 ቀናት በኋላ) መክፈል አለበት። 
የክፍያ መጠን፡ ${amount} ብር።

እባክዎ ጊዜውን ያስታውሱ።

${adminUnitName}`,

    7: `አስፈላጊ ማስታወሻ፡ 

ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ ከ7 ቀናት በኋላ በ${dueDateFormatted} ይጠናቀቃል። 
የክፍያ መጠን፡ ${amount} ብር።

እባክዎ ክፍያውን በጊዜው ያከናውኑ።

${adminUnitName}`,

    3: `አጽንኦት ማስታወሻ፡ 

ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ ከ3 ቀናት በኋላ በ${dueDateFormatted} ይጠናቀቃል። 
የክፍያ መጠን፡ ${amount} ብር።

ጊዜ ካለፈ ቅጣት ይተገበራል።

${adminUnitName}`,

    1: `የመጨረሻ ማስጠንቀቂያ፡ 

ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ ነገ በ${dueDateFormatted} ይጠናቀቃል! 
የክፍያ መጠን፡ ${amount} ብር። 

ጊዜ ካለፈ ቅጣት ይተገበራል። እባክዎ ዛሬ በማክናውን ያከናውኑ።

${adminUnitName}`
  };
  
  return messages[daysBefore] || `ውድ${greetingName}፣

የ${paymentTypeText} ክፍያዎ በ${dueDateFormatted} መክፈል አለበት። 
የክፍያ መጠን፡ ${amount} ብር።

${adminUnitName}`;
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
        
        continue;
      }

      const recipient = {
        user_id: firstOwner.id,
        email: firstOwner.email || null,
        phone: firstOwner.phone || null,
      };
      if (!recipient.email && !recipient.phone) {
        
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
      
    }
    return notifications;
  } catch (error) {
    await transaction.rollback();
    
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
  const startOfDayUTC = new Date(today.setHours(0, 0, 0, 0));
  const endOfDayUTC = new Date(today.setHours(23, 59, 59, 999));

  const notices = await GlobalNoticeSchedule.findAll({
    where: {
      is_active: true,
      scheduled_date: {
        [Op.gte]: startOfDayUTC,
        [Op.lte]: endOfDayUTC,
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
            as: 'ownedLandRecords',
            through: { attributes: [] },
            required: true,
          },
        ],
        where: {
          email: { [Op.ne]: null },
        },
      });
      

      const notificationData = [];
      for (const user of landowners) {
        if (!isValidEmail(user.email)) {
          
          continue;
        }

        const existingNotification = await PaymentNotification.findOne({
          where: {
            global_notice_schedule_id: notice.id,
            notification_type: NOTIFICATION_TYPES.GLOBAL_NOTICE,
            [Op.and]: Sequelize.literal(`recipients->>'user_id' = '${user.id}'`),
            delivery_status: { [Op.in]: ['SENT', 'DELIVERED'] },
          },
          transaction,
        });
        if (existingNotification) {
          
          continue;
        }

        notificationData.push({
          global_notice_schedule_id: notice.id,
          notification_type: NOTIFICATION_TYPES.GLOBAL_NOTICE,
          message: notice.message,
          recipients: {
            user_id: user.id,
            email: user.email,
            phone: null,
          },
          delivery_status: 'PENDING',
          description: `አጠቃላይ ማሳወቂያ ለባለቤት ቁጥር ${user.id}`,
        });
      }

      if (notificationData.length > 0) {
        const createdNotifications = await PaymentNotification.bulkCreate(notificationData, { transaction });
        notifications.push(...createdNotifications);
        
        
        
        
      }

      await notice.update({ is_active: false }, { transaction });
    }

    await transaction.commit();
    return notifications;
  } catch (error) {
    await transaction.rollback();
    
    
    

    
    return notifications; 
  }
};

const sendPendingNotifications = async () => {
  // Get pending notifications with retry limit
  const notifications = await PaymentNotification.findAll({
    where: { 
      delivery_status: 'PENDING',
      [Op.or]: [
        { retry_count: { [Op.lt]: 3 } },
        { retry_count: null }
      ]
    },
    limit: 50, 
    order: [['createdAt', 'ASC']] 
  });

  console.log(`📤 Found ${notifications.length} pending notifications to send`);

  let sentCount = 0;
  let failedCount = 0;

  for (const notification of notifications) {
    try {
      const recipient = notification.recipients;
      
      // Send email if available
      if (recipient.email) {
        await sendEmailNotification(notification, recipient.email);
        console.log(`📧 Email sent for notification ${notification.id} to ${recipient.email}`);
      }
      
      // Send SMS if available
      if (recipient.phone) {
        await sendSMSNotification(notification, recipient.phone);
        console.log(`📱 SMS sent for notification ${notification.id} to ${recipient.phone}`);
      }

      // Mark as delivered
      await notification.update({
        delivery_status: 'DELIVERED',
        sent_date: new Date(),
        retry_count: 0,
        last_error: null
      });

      sentCount++;

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      failedCount++;
      const retryCount = (notification.retry_count || 0) + 1;
      const newStatus = retryCount >= 3 ? 'FAILED' : 'PENDING';
      
      await notification.update({ 
        delivery_status: newStatus,
        retry_count: retryCount,
        last_error: error.message,
        last_retry_at: new Date()
      });
      
      console.error(`❌ Failed to send notification ${notification.id} (attempt ${retryCount}):`, error.message);
    }
  }

  console.log(`📊 Notification sending completed: ${sentCount} sent, ${failedCount} failed`);
  return sentCount;
};

// Email sending function
const sendEmailNotification = async (notification, email) => {

  const subject = notification.notification_type === NOTIFICATION_TYPES.REMINDER 
    ? `የክፍያ ማንቂያ - ${notification.reminder_days_before} ቀናት በፊት` 
    : 'ማስታወቂያ';

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 24px;">
      <div style="max-width: 500px; margin: auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); padding: 32px;">
        <h2 style="color: #2e7d32; margin-bottom: 16px; border-bottom: 2px solid #2e7d32; padding-bottom: 8px;">
          ${subject}
        </h2>
        <div style="font-size: 16px; color: #333; line-height: 1.6; margin-bottom: 24px; white-space: pre-line;">
          ${notification.message}
        </div>
        <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;">
        <p style="font-size: 13px; color: #888;">
          ይህ መልእክት ከ ከተማና መሰረተ ልማት ተልኳል<br>
          This message was sent by ${adminUnit} Service.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: subject,
    html: emailHtml,
  });
};

// SMS sending function (mock implementation)
const sendSMSNotification = async (notification, phone) => {
  // Remove extra spaces and format phone if needed
  const formattedPhone = phone.replace(/\s+/g, '').trim();
  
  // Mock SMS sending - replace with your SMS provider
  console.log(`[SMS MOCK] Sending to ${formattedPhone}: ${notification.message.substring(0, 50)}...`);
  
  // Example with Twilio (uncomment and configure):
  /*
  await twilioClient.messages.create({
    body: notification.message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: formattedPhone
  });
  */
  
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 200));
};

module.exports = {
  createReminderNotifications,
  createOverdueNotifications,
  createPenaltyNotification,
  createConfirmationNotification,
  createGlobalNoticeNotifications,
  sendPendingNotifications,
};