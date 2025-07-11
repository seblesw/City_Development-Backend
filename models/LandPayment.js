
const PAYMENT_TYPES = {
  LEASE_PAYMENT: "የኪራይ ክፍያ",
  TAX: "ግብር",
  COMMERCIAL_SERVICE_FEE: "የንግድ አገልግሎት ክፍያ",
  COMMUNITY_CONTRIBUTION: "የማህበረሰብ አስተዋጽኦ",
  PENALTY: "ቅጣት",
  YENEGADA_AMETAWI_KFYA: "የንግድ አስተዋጽኦ",
};

const PAYMENT_STATUSES = {
  PENDING: "በመጠባበቅ ላይ",
  COMPLETED: "ተጠናቋል",
  FAILED: "አልተሳካም",
  CANCELLED: "ተሰርዟል",
};

module.exports = (db, DataTypes) => {
  const LandPayment = db.define(
    "LandPayment",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "land_records", key: "id" },
      },
      payment_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_TYPES)],
            msg: "የክፍያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      total_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          isDecimal: {
            msg: "የክፍያ ገንዘብ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የክፍያ ገንዘብ 0 ወይም ከዚያ መሆን አለበት።",
          },
        },
      },
      paid_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          isDecimal: {
            msg: "የተከፈለ ገንዘብ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የተከፈለ ገንዘብ 0 ወይም ከዚያ መሆን አለበት።",
          },
        },
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "ETB",
        validate: {
          isIn: {
            args: [["ETB", "USD"]],
            msg: "የገንዘብ አይነት ትክክለኛ መሆን አለበት (ETB ወይም USD)።",
          },
        },
      },
      payment_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PAYMENT_STATUSES.PENDING,
        validate: {
          isIn: {
            args: [Object.values(PAYMENT_STATUSES)],
            msg: "የክፍያ ሁኔታ ከተፈቀዱት ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      penalty_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          isRequiredForPenalty() {
            if (this.payment_type === PAYMENT_TYPES.PENALTY && !this.penalty_reason) {
              throw new Error("የቅጣት ክፍያ የቅጣት ምክንያት መግለፅ አለበት።");
            }
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: {
            args: [0, 500],
            msg: "መግለጫ ከ500 ቁምፊዎች መብለጥ አይችልም።",
          },
        },
      },
      is_draft: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        validate: {
          isBoolean(value) {
            if (typeof value !== "boolean") {
              throw new Error("is_draft የተለያዩ እሴቶች መሆን አለበት (true ወይም false)።");
            }
          },
        },

      },
      payer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "land_payments",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["land_record_id"] },
        { fields: ["payment_type"] },
        { fields: ["payment_status"] },
      ],
    }
  );

  return {LandPayment, PAYMENT_TYPES, PAYMENT_STATUSES};
};