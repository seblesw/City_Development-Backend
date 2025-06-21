// models/LandPayment.js
const { Op } = require("sequelize");

const PAYMENT_TYPES = {
  LEASE_PAYMENT: "የኪራይ ክፍያ",
  TAX: "ግብር",
  COMMERCIAL_SERVICE_FEE: "የንግድ አገልግሎት ክፍያ",
  COMMUNITY_CONTRIBUTION: "የማህበረሰብ አስተዋጽኦ",
  PENALTY: "ቅጣት"
};

const PAYMENT_STATUSES = {
  PENDING: "በመጠባበቅ ላይ",
  COMPLETED: "ተጠናቋል",
  FAILED: "አልተሳካም",
  CANCELLED: "ተሰርዟል"
};

const PAYMENT_METHODS = {
  CASH: "ጥሬ ገንዘብ",
  BANK_TRANSFER: "የባንክ ማስተላለፍ",
  MOBILE_MONEY: "የሞባይል ገንዘብ",
  ONLINE_PAYMENT: "የመስመር ላይ ክፍያ"
};

module.exports = (db, DataTypes) => {
  const LandPayment = db.define(
    "LandPayment",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Nullable for initial creation
        references: { model: "applications", key: "id" }
      },
      payment_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_TYPES)],
            msg: "የክፍያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: {
            args: [0],
            msg: "የክፍያ መጠን ከ0 በታች መሆን አይችልም።"
          }
        }
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ETB",
        validate: {
          isIn: {
            args: [["ETB", "USD"]],
            msg: "የገንዘብ አይነት ትክክለኛ መሆን አለበት (ETB ወይም USD)።"
          }
        }
      },
      payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PAYMENT_STATUSES.PENDING,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_STATUSES)],
            msg: "የክፍያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      payment_method: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_METHODS)],
            msg: "የክፍያ ዘዴ ከተፈቀደው እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      payment_date: {
        type: DataTypes.DATE,
        allowNull: true, // Nullable for pending payments
        validate: {
          isDate: { msg: "ትክክለኛ የክፍያ ቀን ያስገቡ።" },
          notFutureDate(value) {
            if (value) {
              const today = new Date();
              if (new Date(value) > today) {
                throw new Error("የክፍያ ቀን ወደፊት መሆን አይችልም።");
              }
            }
          }
        }
      },
      payment_due_date: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ የክፍያ ተጠናቀቀበት ቀን ያስገቡ።" }
        }
      },
      transaction_reference: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የግብይት ማጣቀሻ ከ50 ቁምፊዎች መብለጥ አይችልም።"
          }
        }
      },
      external_payment_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የውጭ ክፍ�ya መለያ ከ50 ቁምፊዎች መብለጥ አይችልም።"
          }
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 500],
            msg: "መግለጫ ከ500 ቁምፊዎች መብለጥ አይችልም።"
          }
        }
      },
      payment_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      }
    },
    {
      tableName: "land_payments",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["application_id"], where: { application_id: { [Op.ne]: null } } },
        { fields: ["payment_type"] },
        { fields: ["payment_status"] },
        { fields: ["transaction_reference"], unique: true, where: { transaction_reference: { [Op.ne]: null } } },
        { fields: ["external_payment_id"], unique: true, where: { external_payment_id: { [Op.ne]: null } } }
      ],
      hooks: {
        beforeCreate: async (payment, options) => {
          // Validate payment dates
          if (
            payment.payment_date &&
            payment.payment_due_date &&
            new Date(payment.payment_date) > new Date(payment.payment_due_date)
          ) {
            throw new Error("የክፍያ ቀን ከክፍያ ተጠናቀቀበት ቀን በፊት መሆን አለበት።");
          }
          // Initialize payment_history
          payment.payment_history = [
            {
              status: payment.payment_status,
              changed_at: new Date(),
              changed_by: payment.createdBy || null
            }
          ];
        },
        beforeUpdate: async (payment, options) => {
          // Validate payment_status transitions
          const validTransitions = {
            [PAYMENT_STATUSES.PENDING]: [
              PAYMENT_STATUSES.COMPLETED,
              PAYMENT_STATUSES.FAILED,
              PAYMENT_STATUSES.CANCELLED
            ],
            [PAYMENT_STATUSES.FAILED]: [
              PAYMENT_STATUSES.PENDING,
              PAYMENT_STATUSES.COMPLETED,
              PAYMENT_STATUSES.CANCELLED
            ],
            [PAYMENT_STATUSES.COMPLETED]: [],
            [PAYMENT_STATUSES.CANCELLED]: []
          };
          if (payment.changed("payment_status")) {
            const previousStatus = payment.previous("payment_status");
            if (!validTransitions[previousStatus].includes(payment.payment_status)) {
              throw new Error(`ከ${previousStatus} ወደ ${payment.payment_status} መሸጋገር አይችልም።`);
            }
            // Update payment_history
            payment.payment_history = [
              ...(payment.payment_history || []),
              {
                status: payment.payment_status,
                changed_at: new Date(),
                changed_by: payment.updatedBy || null
              }
            ];
          }
          // Prevent updates if application is APPROVED and payment is COMPLETED
          if (payment.application_id) {
            const application = await db.models.Application.findByPk(payment.application_id, {
              transaction: options.transaction
            });
            if (
              application?.status === "ጸድቋል" &&
              payment.payment_status === PAYMENT_STATUSES.COMPLETED
            ) {
              throw new Error("የጸድቋል መጠየቂያ እና ተጠናቅቋል ክፍያ መቀየር አይችልም።");
            }
          }
        }
      }
    }
  );

  

  return LandPayment;
};