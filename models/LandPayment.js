
const PAYMENT_TYPES = {
  LEASE_PAYMENT: "የሊዝ ክፍያ",
  TAX: "የቦታ ኪራይ ክፍያ",
  SERVICE_FEE: "የአገልግሎት ክፍያ",
  COMMUNITY_CONTRIBUTION: "የማህበረሰብ አስተዋጽኦ",
  PENALTY: "ቅጣት",
};

const PAYMENT_STATUSES = {
  PENDING: "በመጠባበቅ ላይ",
  COMPLETED: "ተጠናቋል",
  PARTIAL:"ግማሽ",
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
      anual_payment: {
        type: DataTypes.DECIMAL,
        allowNull: true,
        validate: {
          isDecimal: {
            msg: "የአመታዊ ክፍያ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የአመታዊ ክፍያ 0 ወይም ከዚያ መሆን አለበት።",
          },
        },
      },
      initial_payment:{
        type:DataTypes.DECIMAL,
        allowNull:true,
        validate: {
          isDecimal: {
            msg: "የመጀመሪያ ክፍያ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የመጀመሪያ ክፍያ 0 ወይም ከዚያ መሆን አለበት።",
          },
        },
      
      },
      penality_amount: {
        type: DataTypes.DECIMAL,
        allowNull: true,
        validate: {
          isDecimal: {
            msg: "የቅጣት ክፍያ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የቅጣት ክፍያ 0 ወይም ከዚያ በታች መሆን የለበትም።",
          },
        },
      },
      penality_rate: {
        type: DataTypes.DECIMAL,
        allowNull: true,
        validate: {
          isDecimal: {
            msg: "የቅጣት መጠን ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የቅጣት መጠን 0 ወይም ከዚያ መሆን አለበት።",
          },
        },
      },
      remaining_amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: {
          isDecimal: {
            msg: "የቀረው ገንዘብ ትክክለኛ መሆን አለበት።",
          },
          min: {
            args: [0],
            msg: "የቀረው ገንዘብ 0 ወይም  ከዚህ በላይ መሆን አለበት።",
          },
        },
      },
      receipt_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የክፍያ ሪሲት ቁጥር ከ50 ቁምፊዎች መብለጥ አይችልም።",
          },
        },
      },
      payment_date: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: {
            msg: "የክፍያ ቀን ትክክለኛ መሆን አለበት።",
          },
        },
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "ETB",
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
            if (
              this.payment_type === PAYMENT_TYPES.PENALTY &&
              !this.penalty_reason
            ) {
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
      },
      payer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
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

  return { LandPayment, PAYMENT_TYPES, PAYMENT_STATUSES };
};
