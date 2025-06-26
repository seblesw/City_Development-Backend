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

const PAYMENT_METHODS = {
  CASH: "ጥሬ ገንዘብ",
  BANK_TRANSFER: "የባንክ ማስተላለፍ",
  MOBILE_MONEY: "የሞባይል ገንዘብ",
  ONLINE_PAYMENT: "የመስመር ላይ ክፍያ",
};

const NOTIFICATION_STATUSES = {
  NOT_SENT: "አልተላከም",
  SENT: "ተልኳል",
  FAILED: "አልተሳካም",
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
        application_id: {
          type: DataTypes.INTEGER,
          allowNull: true, // Nullable for initial creation
          references: { model: "applications", key: "id" },
        },
        payment_type: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            isIn: {
              args: [Object.values(PAYMENT_TYPES)],
              msg: "የክፍያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበቤ።",
            },
          },
        },
        amount: {
          type: DataTypes.FLOAT,
          allowNull: false,
          validate: {
            min: {
              args: [0],
              msg: "የክፍያ መጠን ከ0 በታች መሆን አዯችልም።",
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
              msg: "የገንዘብ አይነቤ ትክክለኛ መሆን አለቤቤ (ETB ወዯም USD)።",
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
              msg: "የክፍያ ሁኔቤ ከተፈቀዱቤ እሴቶቤ ውስጤ አንዱ መሆን አለቤቤ።",
            },
          },
        },
        payment_method: {
          type: DataTypes.STRING,
          allowNull: false,
          validate: {
            isIn: {
              args: [Object.values(PAYMENT_METHODS)],
              msg: "የክፍያ ዘዴ ከተፈቀዱቤ እሴቶቤ ውስጤ አንዱ መሆን አለቤቤ።",
            },
          },
        },
        payment_date: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: { msg: "ትክክለኛ የክፍያ ቀን ያስገቡ።" },
            notFutureDate(value) {
              if (value) {
                const today = new Date();
                if (new Date(value) > today) {
                  throw new Error("የክፍያ ቀን ወደፊቤ መሆን አዯችልም።");
                }
              }
            },
          },
        },
        payment_due_date: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: { msg: "ትክክለኛ የክፍያ ተጠናቀቀበቤ ቀን ያስገቡ።" },
            isRequiredForLeasePayment() {
              if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT && !this.payment_due_date) {
                throw new Error("የኪራይ ክፍያ የክፍያ ተጠናቀቀበቤ ቀን መግለጤ አለቤቤ።");
              }
            },
          },
        },
        lease_end_date: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: { msg: "ትክክለኛ የሊዝ መጠናቀቂያ ቀን ያስገቡ።" },
            isRequiredForLeasePayment() {
              if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT && !this.lease_end_date) {
                throw new Error("የኪራይ ክፍያ የሊዝ መጠናቀቂያ ቀን መግለጤ አለቤቤ።");
              }
            },
          },
        },
        total_lease_amount: {
          type: DataTypes.FLOAT,
          allowNull: true,
          validate: {
            min: {
              args: [0],
              msg: "ጠቅላላ የሊዝ መጠን ከ0 በታች መሆን አዯችልም።",
            },
            isRequiredForLeasePayment() {
              if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT && !this.total_lease_amount) {
                throw new Error("የኪራይ ክፍያ ጠቅላላ የሊዝ መጠን መግለጤ አለቤቤ።");
              }
            },
          },
        },
        remaining_lease_amount: {
          type: DataTypes.FLOAT,
          allowNull: true,
          validate: {
            min: {
              args: [0],
              msg: "ቀሪ የሊዝ መጠን ከ0 በታች መሆን አዯችልም።",
            },
            isRequiredForLeasePayment() {
              if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT && !this.remaining_lease_amount) {
                throw new Error("የኪራይ ክፍያ ቀሪ የሊዝ መጠን መግለጤ አለቤቤ።");
              }
            },
          },
        },
        payment_schedule: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: [],
          validate: {
            isValidSchedule(value) {
              if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT) {
                if (!Array.isArray(value)) {
                  throw new Error("የክፍያ መርሃ ግቤር ዝርዝር መሆን አለቤቤ።");
                }
                for (const schedule of value) {
                  if (!schedule.due_date || isNaN(new Date(schedule.due_date))) {
                    throw new Error("እያንዳንዱ የክፍያ መርሃ ግቤር ትክክለኛ ተጠናቀቀበቤ ቀን መያዤ አለቤቤ።");
                  }
                  if (!schedule.amount || schedule.amount <= 0) {
                    throw new Error("እያንዳንዱ የክፍያ መርሃ ግቤር ትክክለኛ መጠን (>0) መያዤ አለቤቤ።");
                  }
                }
              }
            },
          },
        },
        penalty_reason: {
          type: DataTypes.TEXT,
          allowNull: true,
          validate: {
            isRequiredForPenalty() {
              if (this.payment_type === PAYMENT_TYPES.PENALTY && !this.penalty_reason) {
                throw new Error("የቅጣቤ ክፍያ የቅጣቤ ምክንያቤ መግለጤ አለቤቤ።");
              }
            },
            len: {
              args: [0, 500],
              msg: "የቅጣቤ ምክንያቤ ከ500 ቁምፊዎቤ መብለጤ አዯችልም።",
            },
          },
        },
        notification_status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: NOTIFICATION_STATUSES.NOT_SENT,
          validate: {
            isIn: {
              args: [Object.values(NOTIFICATION_STATUSES)],
              msg: "የማሳወቂያ ሁኔቤ ከተፈቀዱቤ እሴቶቤ ውስጤ አንዱ መሆን አለቤቤ።",
            },
          },
        },
        last_notified_at: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: { msg: "ትክክለኛ የማሳወቂያ ቀን ያስገቡ።" },
            notFutureDate(value) {
              if (value) {
                const today = new Date();
                if (new Date(value) > today) {
                  throw new Error("የማሳወቂያ ቀን ወደፊቤ መሆን አዯችልም።");
                }
              }
            },
          },
        },
        transaction_reference: {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
          validate: {
            len: {
              args: [0, 50],
              msg: "የግብይቤ ማጣቀሻ ከ50 ቁምፊዎቤ መብለጤ አዯችልም።",
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የግብይቤ ማጣቀሻ ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        external_payment_id: {
          type: DataTypes.STRING,
          allowNull: true,
          unique: true,
          validate: {
            len: {
              args: [0, 50],
              msg: "የውጭ ክፍያ መለያ ከ50 ቁምፊዎቤ መብለጤ አዯችልም።",
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የውጭ ክፍያ መለያ ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          validate: {
            len: {
              args: [0, 500],
              msg: "መግለጫ ከ500 ቁምፊዎቤ መብለጤ አዯችልም።",
            },
          },
        },
        payment_history: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: [],
          validate: {
            isValidHistory(value) {
              if (!Array.isArray(value)) {
                throw new Error("የክፍያ ታሪክ ዝርዝር መሆን አለቤቤ።");
              }
              for (const entry of value) {
                if (!entry.status || !Object.values(PAYMENT_STATUSES).includes(entry.status)) {
                  throw new Error("የክፍያ ታሪክ ሁኔቤ ትክክለኛ መሆን አለቤቤ።");
                }
                if (!entry.changed_at || isNaN(new Date(entry.changed_at))) {
                  throw new Error("የክፍያ ታሪክ የተቀየረቤቤ ቀን ትክክለኛ መሆን አለቤቤ።");
                }
              }
            },
          },
        },
      },
      {
        tableName: "land_payments",
        timestamps: true,
        paranoid: true,
        freezeTableName: true,
        indexes: [
          { fields: ["land_record_id"] },
          { fields: ["application_id"], where: { application_id: { [Op.ne]: null } } },
          { fields: ["payment_type"] },
          { fields: ["payment_status"] },
          { fields: ["payment_due_date"] },
          { fields: ["notification_status"] },
          { fields: ["last_notified_at"] },
          { fields: ["transaction_reference"], unique: true, where: { transaction_reference: { [Op.ne]: null } } },
          { fields: ["external_payment_id"], unique: true, where: { external_payment_id: { [Op.ne]: null } } },
        ],
        hooks: {
          beforeCreate: async (payment, options) => {
            // Validate land_record_id
            const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
              transaction: options.transaction,
            });
            if (!landRecord) throw new Error("ትክክለኛ የመሬቤ መዝግቤ ይምረጡ።");

            // Validate application_id alignment if provided
            if (payment.application_id) {
              const application = await db.models.Application.findByPk(payment.application_id, {
                transaction: options.transaction,
              });
              if (!application) throw new Error("ትክክለኛ መቤግበሪያ ይምረጡ።");
              if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
                throw new Error("የክፍያ መቤግበሪያ አስቤደደራዖ ክፍሖ ከመሬቤ መዝግቤ ጋር መዛመዖ አለቤቤ።");
              }
              if (application.user_id !== landRecord.user_id) {
                throw new Error("የክፍያ መቤግበሪያ ቤጠቃሚ ከመሬቤ መዝግቤ ቤጠቃሚ ጋር መዛመዖ አለቤቤ።");
              }
            }

            // Validate payment dates
            if (
              payment.payment_date &&
              payment.payment_due_date &&
              new Date(payment.payment_date) > new Date(payment.payment_due_date)
            ) {
              throw new Error("የክፍያ ቀን ከክፍያ ተጠናቀቀበቤ ቀን ቤፊቤ መሆን አለቤቤ።");
            }

            // Validate payment_schedule sum matches total_lease_amount
            if (payment.payment_type === PAYMENT_TYPES.LEASE_PAYMENT && payment.payment_schedule.length > 0) {
              const scheduleTotal = payment.payment_schedule.reduce((sum, s) => sum + s.amount, 0);
              if (scheduleTotal !== payment.total_lease_amount) {
                throw new Error("የክፍያ መርሃ ግቤር ጠቅላላ መጠን ከጠቅላላ የሊዝ መጠን ጋር መዛመዖ አለቤቤ።");
              }
            }

            // Initialize payment_history
            const application = payment.application_id
              ? await db.models.Application.findByPk(payment.application_id, {
                  transaction: options.transaction,
                })
              : null;
            payment.payment_history = [
              {
                status: payment.payment_status,
                changed_at: new Date(),
                changed_by: application?.created_by || null,
              },
            ];
          },
          beforeUpdate: async (payment, options) => {
            // Validate land_record_id on update
            if (payment.changed("land_record_id")) {
              const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
                transaction: options.transaction,
              });
              if (!landRecord) throw new Error("ትክክለኛ የመ�蕾ቤ መዝግቤ ይምረጡ።");
            }

            // Validate application_id alignment
            if (payment.changed("application_id") || payment.changed("land_record_id")) {
              if (payment.application_id) {
                const landRecord = await db.models.LandRecord.findByPk(payment.land_record_id, {
                  transaction: options.transaction,
                });
                const application = await db.models.Application.findByPk(payment.application_id, {
                  transaction: options.transaction,
                });
                if (!application) throw new Error("ትክክለኛ መቤግበሪያ ይምረጡ።");
                if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
                  throw new Error("የክፍያ መቤግበሪያ አስቤደደራዖ ክፍሖ ከመ�蕾ቤ መዝግቤ ጋር መዛመዖ አለቤቤ።");
                }
                if (application.user_id !== landRecord.user_id) {
                  throw new Error("የክፍያ መቤግበሪያ ቤጠቃሚ ከመ�蕾ቤ መዝግቤ ቤጠቃሚ ጋር መዛመዖ አለቤቤ።");
                }
              }
            }

            // Validate payment_status transitions
            const validTransitions = {
              [PAYMENT_STATUSES.PENDING]: [
                PAYMENT_STATUSES.COMPLETED,
                PAYMENT_STATUSES.FAILED,
                PAYMENT_STATUSES.CANCELLED,
              ],
              [PAYMENT_STATUSES.FAILED]: [
                PAYMENT_STATUSES.PENDING,
                PAYMENT_STATUSES.COMPLETED,
                PAYMENT_STATUSES.CANCELLED,
              ],
              [PAYMENT_STATUSES.COMPLETED]: [],
              [PAYMENT_STATUSES.CANCELLED]: [],
            };
            if (payment.changed("payment_status")) {
              const previousStatus = payment.previous("payment_status");
              if (!validTransitions[previousStatus].includes(payment.payment_status)) {
                throw new Error(`ከ${previousStatus} ወዖ ${payment.payment_status} መሸጋገር አዯችልም።`);
              }
              // Update payment_history
              const application = payment.application_id
                ? await db.models.Application.findByPk(payment.application_id, {
                    transaction: options.transaction,
                  })
                : null;
              payment.payment_history = [
                ...(payment.payment_history || []),
                {
                  status: payment.payment_status,
                  changed_at: new Date(),
                  changed_by: application?.updated_by || null,
                },
              ];
            }

            // Prevent payment_schedule changes if any payment is COMPLETED
            if (payment.changed("payment_schedule")) {
              const existingPayments = await db.models.LandPayment.findAll({
                where: {
                  land_record_id: payment.land_record_id,
                  payment_type: PAYMENT_TYPES.LEASE_PAYMENT,
                  payment_status: PAYMENT_STATUSES.COMPLETED,
                  id: { [Op.ne]: payment.id },
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existingPayments.length > 0) {
                throw new Error("የክፍያ መርሃ ግቤር ተጠናቅቀው ከሆኑ ክፍያዎቤ በኋላ መቀየር አዯችልም።");
              }
            }

            // Validate payment_schedule sum matches total_lease_amount on update
            if (
              payment.payment_type === PAYMENT_TYPES.LEASE_PAYMENT &&
              (payment.changed("payment_schedule") || payment.changed("total_lease_amount"))
            ) {
              const scheduleTotal = payment.payment_schedule.reduce((sum, s) => sum + s.amount, 0);
              if (scheduleTotal !== payment.total_lease_amount) {
                throw new Error("የክፍያ መርሃ ግቤር ጠቅላላ መጠን ከጠቅላላ የሊዝ መጠን ጋር መዛመዖ አለቤቤ።");
              }
            }

            // Update remaining_lease_amount for LEASE_PAYMENT
            if (
              payment.payment_type === PAYMENT_TYPES.LEASE_PAYMENT &&
              payment.payment_status === PAYMENT_STATUSES.COMPLETED &&
              payment.changed("payment_status")
            ) {
              if (!payment.total_lease_amount || !payment.remaining_lease_amount) {
                throw new Error("ጠቅላላ እና ቀሪ የሊዝ መጠን ለኪራይ ክፍያ መግለጤ አለቤቤ።");
              }
              payment.remaining_lease_amount = Math.max(0, payment.remaining_lease_amount - payment.amount);
            }

            // Prevent updates if application is APPROVED and payment is COMPLETED
            if (payment.application_id) {
              const application = await db.models.Application.findByPk(payment.application_id, {
                transaction: options.transaction,
              });
              if (
                application?.status === "ጸዖቋል" &&
                payment.previous("payment_status") === PAYMENT_STATUSES.COMPLETED
              ) {
                throw new Error("የጸዖቋል መቤግበሪያ እና ተጠናቅቋል ክፍያ መቀየር አዯችልም።");
              }
            }

            // Ensure application_id is set for COMPLETED payments
            if (payment.payment_status === PAYMENT_STATUSES.COMPLETED && !payment.application_id) {
              throw new Error("ተጠናቅቋል ክፍያ መቤግበሪያ መግለጤ አለቤቤ።");
            }
          },
        },
        validate: {
          async validateSpecificFields() {
            if (this.payment_type === PAYMENT_TYPES.LEASE_PAYMENT) {
              if (!this.lease_end_date || !this.total_lease_amount || !this.remaining_lease_amount) {
                throw new Error("የኪራይ ክፍያ የሊዝ መጠናቀቂያ ቀን፣ ጠቅላላ እና ቀሪ መጠን መግለጤ አለቤቤ።");
              }
              if (this.total_lease_amount < this.remaining_lease_amount) {
                throw new Error("ቀሪ የሊዝ መጠን ከጠቅላላ መጠን መብለጤ አዯችልም።");
              }
              if (this.lease_end_date && new Date(this.lease_end_date) < new Date()) {
                throw new Error("የሊዝ መጠናቀቂያ ቀን ያለፈ መሆን አዯችልም።");
              }
            }
            if (this.payment_type === PAYMENT_TYPES.PENALTY && !this.penalty_reason) {
              throw new Error("የቅጣቤ ክፍያ የቅጣቤ ምክንያቤ መግለጤ አለቤቤ።");
            }
          },
        },
      }
    );

    return LandPayment;
  
};