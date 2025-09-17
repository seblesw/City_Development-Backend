const NOTIFICATION_TYPES = {
  REMINDER: "ማንቂያ",
  OVERDUE: "ያለፈበት ማሳወቂያ",
  CONFIRMATION: "የክፍያ ማረጋገጫ",
  PENALTY: "ቅጣት ማሳወቂያ",
};

module.exports = (db, DataTypes) => {
  const PaymentNotification = db.define(
    "PaymentNotification",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      schedule_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "payment_schedules", key: "id" },
      },
      notification_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(NOTIFICATION_TYPES)],
            msg: "Invalid notification type.",
          },
        },
      },
      sent_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        validate: { isDate: true },
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: { len: [1, 1000] }, 
      },
      recipients: {
        type: DataTypes.JSON, 
        allowNull: false,
        validate: {
          isValidRecipient(value) {
            if (typeof value !== 'object' || value === null) {
              throw new Error("Recipient must be a valid object.");
            }
            if (!value.user_id) {
              throw new Error("Recipient must have a user_id.");
            }
            if (!value.email && !value.phone) {
              throw new Error("Recipient must have either an email or phone.");
            }
          },
        },
      },
      delivery_status: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "SENT",
        validate: {
          isIn: {
            args: [["SENT", "FAILED", "DELIVERED"]],
            msg: "Invalid delivery status.",
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: { len: [0, 500] },
      },
    },
    {
      tableName: "payment_notifications",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["schedule_id"] },
        { fields: ["notification_type"] },
        { fields: ["sent_date"] },
      ],
    }
  );

  return { PaymentNotification, NOTIFICATION_TYPES };
};