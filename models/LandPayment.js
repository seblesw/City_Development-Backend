const { Op } = require("sequelize");

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
            msg: "የክፍያ ሁኔታ ከተፈቀዱቷ እሴቶች ውስጥ አንዱ መሆን አለበት።",
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
          len: {
            args: [0, 500],
            msg: "የቅጣት ምክንያት ከ500 ቁምፊዎች መብለጥ አይችልም።",
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
        { fields: ["payer_id"] },
      ],
      hooks: {
        beforeCreate: async (payment, options) => {
          // Validate payer_id role
          const payer = await db.models.User.findByPk(payment.payer_id, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction,
          });
          if (!payer || !["መመዝገቢ", "አስተዳደር"].includes(payer.role?.name)) {
            throw new Error("ክፍያ መፈፀም የሚችሉቷ መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
          }

          // Validate land_record_id
          const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
            transaction: options.transaction,
          });
          if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");

          // Log payment creation in LandRecord.action_log
          landRecord.action_log = [
            ...(landRecord.action_log || []),
            {
              action: `PAYMENT_CREATED_${payment.payment_type || "UNKNOWN"}`,
              changed_by: payment.payer_id,
              changed_at: payment.createdAt || new Date(),
              payment_id: payment.id,
            },
          ];
          await landRecord.save({ transaction: options.transaction });
        },
        beforeUpdate: async (payment, options) => {
          // Validate payer_id role on update
          if (payment.changed("payer_id")) {
            const payer = await db.models.User.findByPk(payment.payer_id, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!payer || !["መመዝገቢ", "አስተዳደር"].includes(payer.role?.name)) {
              throw new Error("ክፍያ መፈፀም የሚችሉቷ መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
            }
          }

          // Validate land_record_id on update
          if (payment.changed("land_record_id")) {
            const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
              transaction: options.transaction,
            });
            if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
          }

          // Validate payment_status transitions
          const validTransitions = {
            [PAYMENT_STATUSES.PENDING]: [
              PAYMENT_STATUSES.COMPLETED,
              PAYMENT_STATUSES.FAILED,
              PAYMENT_STATUSES.CANCELLED,
            ],
            [PAYMENT_STATUSES.FAILED]: [PAYMENT_STATUSES.PENDING],
            [PAYMENT_STATUSES.COMPLETED]: [],
            [PAYMENT_STATUSES.CANCELLED]: [],
          };
          if (payment.changed("payment_status")) {
            const previousStatus = payment.previous("payment_status");
            if (!validTransitions[previousStatus]?.includes(payment.payment_status)) {
              throw new Error(`ከ${previousStatus} ወደ ${payment.payment_status} መሸጋገር አይችልም።`);
            }
          }

          // Log payment update in LandRecord.action_log
          const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
            transaction: options.transaction,
          });
          if (landRecord) {
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: `PAYMENT_UPDATED_${payment.payment_type || "UNKNOWN"}`,
                changed_by: payment.payer_id,
                changed_at: payment.updatedAt || new Date(),
                payment_id: payment.id,
              },
            ];
            await landRecord.save({ transaction: options.transaction });
          }
        },
      },
      validate: {
        async validateLandRecord() {
          const landRecord = await db.models.LandRecord.findByPk(this.land_record_id);
          if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
        },
      },
    }
  );

  return LandPayment;
};