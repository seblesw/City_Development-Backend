const { Op } = require("sequelize");

const APPLICATION_STATUSES = {
  DRAFT: "ረቂቅ",
  SUBMITTED: "ቀርቧል",
  UNDER_REVIEW: "በግምገማ ላይ",
  APPROVED: "ጸድቋል",
  REJECTED: "ውድቅ ተደርጓል",
};

const APPLICATION_TYPES = {
  OWNERSHIP_REGISTRATION: "የባለቤትነት ምዝገባ",
  OWNERSHIP_TRANSFER: "የባለቤትነት ሽግግር",
  LEASE_REGISTRATION: "የኪራይ ምዝገባ",
  PAYMENT_REQUEST: "የክፍያ ጥያቄ",
  OTHER: "ሌላ",
};

const PRIORITIES = {
  LOW: "ዝቅተኛ",
  MEDIUM: "መካከለኛ",
  HIGH: "ከፍተኛ",
};

const NOTIFICATION_STATUSES = {
  NOT_SENT: "አልተላከም",
  SENT: "ተልኳል",
  FAILED: "አልተሳካም",
};

module.exports = (db, DataTypes) => {
  const Application = db.define(
    "Application",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      application_code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የመጠየቂያ ኮድ ባዶ መሆን አይችልም።" },
          len: { args: [10, 20], msg: "የመጠየቂያ ኮድ ከ10 እስከ 20 ቁምፊዎች መሆን አለበት።" },
        },
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_records", key: "id" },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: APPLICATION_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_STATUSES)],
            msg: "የመጠየቂያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      status_history: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidHistory(value) {
            if (!Array.isArray(value)) {
              throw new Error("የሁኔታ ታሪክ ዝርዝር መሆን አለበት።");
            }
            for (const entry of value) {
              if (
                !entry.status ||
                !Object.values(APPLICATION_STATUSES).includes(entry.status)
              ) {
                throw new Error("የሁኔታ ታሪክ ሁኔታ ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_at || isNaN(new Date(entry.changed_at))) {
                throw new Error("የሁኔታ ታሪክ የተቀየረበት ቀን ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_by) {
                throw new Error("የሁኔታ ታሪክ ተቀያሪ መግለጥ አለበት።");
              }
            }
          },
        },
      },
      action_log: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidLog(value) {
            if (!Array.isArray(value)) {
              throw new Error("የተግባር መዝገብ ዝርዝር መሆን አለበት።");
            }
            for (const entry of value) {
              if (!entry.action || typeof entry.action !== "string") {
                throw new Error("የተግባር መዝገብ ተግባር ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_at || isNaN(new Date(entry.changed_at))) {
                throw new Error("የተግባር መዝገብ የተቀየረበት ቀን ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_by) {
                throw new Error("የተግባር መዝገብ ተቀያሪ መግለጥ አለበት።");
              }
            }
          },
        },
      },
      application_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_TYPES)],
            msg: "የመጠየቂያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PRIORITIES.MEDIUM,
        validate: {
          isIn: {
            args: [Object.values(PRIORITIES)],
            msg: "ቅድሚያ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "የውድቅ ምክንያት ከ500 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ የቀረበ ቀን ያስገቡ።" },
          notFutureDate(value) {
            if (value) {
              const today = new Date();
              if (new Date(value) > today) {
                throw new Error("የቀረበ ቀን ወደፊት መሆን አይችልም።");
              }
            }
          },
        },
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ የጸደቀ ቀን ያስገቡ።" },
          notFutureDate(value) {
            if (value) {
              const today = new Date();
              if (new Date(value) > today) {
                throw new Error("የጸደቀ ቀን ወደፊት መሆን አይችልም።");
              }
            }
          },
        },
      },
      rejected_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ የውድቅ ቀን ያስገቡ።" },
          notFutureDate(value) {
            if (value) {
              const today = new Date();
              if (new Date(value) > today) {
                throw new Error("የውድቅ ቀን ወደፊት መሆን አይችልም።");
              }
            }
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
            msg: "የማሳወቂያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
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
                throw new Error("የማሳወቂያ ቀን ወደፊት መሆን አይችልም።");
              }
            }
          },
        },
      },
      related_application_ids: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidIds(value) {
            if (!Array.isArray(value)) {
              throw new Error("ተዛማጅ መጠየቂያዎች ዝርዝር መሆን አለበት።");
            }
            for (const id of value) {
              if (!Number.isInteger(id)) {
                throw new Error("ተዛማጅ መጠየቂያዎች መለያዎች ትክክለኛ ቁጥሮች መሆን አለበት።");
              }
            }
          },
        },
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      deleted_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "applications",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["application_code"] },
        { fields: ["user_id"] },
        { fields: ["administrative_unit_id"] },
        {
          fields: ["land_record_id"],
          where: { land_record_id: { [Op.ne]: null } },
        },
        { fields: ["status"] },
        { fields: ["application_type"] },
        { fields: ["priority"] },
        { fields: ["submitted_at"] },
        { fields: ["notification_status"] },
        { fields: ["last_notified_at"] },
      ],
      hooks: {
        beforeCreate: async (application, options) => {
          // Generate unique application_code
          const generateCode = () => {
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(
              100000 + Math.random() * 900000
            ).toString();
            return `APP-${timestamp}-${random}`;
          };
          let code = generateCode();
          let existing = await db.models.Application.findOne({
            where: { application_code: code },
            transaction: options.transaction,
          });
          while (existing) {
            code = generateCode();
            existing = await db.models.Application.findOne({
              where: { application_code: code },
              transaction: options.transaction,
            });
          }
          application.application_code = code;

          // Validate created_by role
          const creator = await db.models.User.findByPk(
            application.created_by,
            {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            }
          );
          if (!creator || !["መመዝገቢ", "አስተዳደር"].includes(creator.role?.name)) {
            throw new Error("መጠየቂያ መፍጠር የሚችሉት መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
          }

          // Validate administrative_unit_id consistency
          const owner = await db.models.User.findByPk(application.user_id, {
            transaction: options.transaction,
          });
          if (!owner) throw new Error("ተጠቃሚ አልተገኘም።");
          if (
            creator.administrative_unit_id !== owner.administrative_unit_id ||
            creator.administrative_unit_id !==
              application.administrative_unit_id
          ) {
            throw new Error("አስተዳደራዊ ክፍል ከመመዝገቢው እና ተጠቃሚ ጋር መመሳሰል አለበት።");
          }

          // Validate land_record_id
          if (application.land_record_id) {
            const landRecord = await db.models.LandRecord.findByPk(
              application.land_record_id,
              {
                transaction: options.transaction,
              }
            );
            if (!landRecord) throw new Error("የመሬት መዝገብ አልተገኘም።");
            if (
              (landRecord.application_id &&
                landRecord.application_id !== application.id) ||
              landRecord.administrative_unit_id !==
                application.administrative_unit_id ||
              landRecord.user_id !== application.user_id
            ) {
              throw new Error(
                "የመሬት መዝገብ ከመጠየቂያ፣ ተጠቃሚ እና አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።"
              );
            }
          }

          // Validate application_type requires land_record_id
          if (
            [
              APPLICATION_TYPES.OWNERSHIP_REGISTRATION,
              APPLICATION_TYPES.OWNERSHIP_TRANSFER,
              APPLICATION_TYPES.LEASE_REGISTRATION,
            ].includes(application.application_type) &&
            !application.land_record_id
          ) {
            throw new Error(
              "የባለቤትነት ምዝገባ፣ ሽግግር ወይም የኪራይ ምዝገባ የመሬት መዝገብ መለያ ይፈለጋል።"
            );
          }

          // Initialize status_history and action_log
          application.status_history = [
            {
              status: application.status,
              changed_by: application.created_by,
              changed_at: new Date(),
            },
          ];
          application.action_log = [
            {
              action: "CREATED",
              changed_by: application.created_by,
              changed_at: new Date(),
            },
          ];
        },
        beforeUpdate: async (application, options) => {
          // Validate status transitions
          const validTransitions = {
            [APPLICATION_STATUSES.DRAFT]: [APPLICATION_STATUSES.SUBMITTED],
            [APPLICATION_STATUSES.SUBMITTED]: [
              APPLICATION_STATUSES.UNDER_REVIEW,
            ],
            [APPLICATION_STATUSES.UNDER_REVIEW]: [
              APPLICATION_STATUSES.APPROVED,
              APPLICATION_STATUSES.REJECTED,
            ],
            [APPLICATION_STATUSES.REJECTED]: [APPLICATION_STATUSES.SUBMITTED],
            [APPLICATION_STATUSES.APPROVED]: [],
          };
          if (application.changed("status")) {
            const previousStatus = application.previous("status");
            if (
              !validTransitions[previousStatus]?.includes(application.status)
            ) {
              throw new Error(
                `ከ${previousStatus} ወደ ${application.status} መሸጋገር አይችልም።`
              );
            }

            // Validate updated_by role
            const updater = await db.models.User.findByPk(
              application.updated_by,
              {
                include: [{ model: db.models.Role, as: "role" }],
                transaction: options.transaction,
              }
            );
            if (!updater || !["መመዝገቢ", "አስተዳደር"].includes(updater.role?.name)) {
              throw new Error("መጠየቂያ መቀየር የሚችሉት መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
            }

            // Update status_history and action_log
            application.status_history = [
              ...(application.status_history || []),
              {
                status: application.status,
                changed_by: application.updated_by,
                changed_at: new Date(),
              },
            ];
            application.action_log = [
              ...(application.action_log || []),
              {
                action: `STATUS_CHANGED_TO_${application.status}`,
                changed_by: application.updated_by,
                changed_at: new Date(),
              },
            ];

            // Reset notification_status on status change
            application.notification_status = NOTIFICATION_STATUSES.NOT_SENT;

            // Update timestamps and approved_by
            if (application.status === APPLICATION_STATUSES.SUBMITTED) {
              application.submitted_at = new Date();
            }
            if (application.status === APPLICATION_STATUSES.APPROVED) {
              application.approved_at = new Date();
              application.approved_by = application.updated_by;
            }
            if (application.status === APPLICATION_STATUSES.REJECTED) {
              application.rejected_at = new Date();
              if (!application.rejection_reason) {
                throw new Error("ውድቅ ሁኔታ የውድቅ ምክንያት ይፈለጋል።");
              }
            }

            // Clear rejection_reason when transitioning from REJECTED to SUBMITTED
            if (
              previousStatus === APPLICATION_STATUSES.REJECTED &&
              application.status === APPLICATION_STATUSES.SUBMITTED
            ) {
              application.rejection_reason = null;
              application.rejected_at = null;
            }
          }

          // Ensure land_record_id for specific application_types and SUBMITTED status
          if (
            [
              APPLICATION_TYPES.OWNERSHIP_REGISTRATION,
              APPLICATION_TYPES.OWNERSHIP_TRANSFER,
              APPLICATION_TYPES.LEASE_REGISTRATION,
            ].includes(application.application_type) &&
            !application.land_record_id
          ) {
            throw new Error(
              "የባለቤትነት ምዝገባ፣ ሽግግር ወይም የኪራይ ምዝገባ የመሬት መዝገብ መለያ ይፈለጋል።"
            );
          }
          if (
            application.status === APPLICATION_STATUSES.SUBMITTED &&
            !application.land_record_id
          ) {
            throw new Error("ቀርቧል ሁኔታ የመሬት መዝገብ መለያ ይፈለጋል።");
          }

          // Validate user_id or administrative_unit_id changes
          if (
            application.changed("user_id") ||
            application.changed("administrative_unit_id")
          ) {
            const owner = await db.models.User.findByPk(application.user_id, {
              transaction: options.transaction,
            });
            if (!owner) throw new Error("ተጠቃሚ አልተገኘም።");
            if (
              owner.administrative_unit_id !==
              application.administrative_unit_id
            ) {
              throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
            }
          }

          // Validate land_record_id changes
          if (
            application.changed("land_record_id") &&
            application.land_record_id
          ) {
            const landRecord = await db.models.LandRecord.findByPk(
              application.land_record_id,
              {
                transaction: options.transaction,
              }
            );
            if (!landRecord) throw new Error("የመሬት መዝገብ አልተገኘም።");
            if (
              (landRecord.application_id &&
                landRecord.application_id !== application.id) ||
              landRecord.administrative_unit_id !==
                application.administrative_unit_id ||
              landRecord.user_id !== application.user_id
            ) {
              throw new Error(
                "የመሬት መዝገብ ከመጠየቂያ፣ ተጠቃሚ እና አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።"
              );
            }
          }

          // Ensure at least one Document for SUBMITTED status (except PAYMENT_REQUEST)
          if (
            application.status === APPLICATION_STATUSES.SUBMITTED &&
            application.application_type !== APPLICATION_TYPES.PAYMENT_REQUEST
          ) {
            const documents = await db.models.Document.findOne({
              where: {
                application_id: application.id,
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (!documents) {
              throw new Error("ቀርቧል ሁኔታ ቢያንስ አንድ ሰነድ ይፈለጋል።");
            }
          }

          // Validate LandPayment for PAYMENT_REQUEST before APPROVED status
          if (
            application.application_type ===
              APPLICATION_TYPES.PAYMENT_REQUEST &&
            application.status === APPLICATION_STATUSES.APPROVED &&
            application.changed("status")
          ) {
            const payments = await db.models.LandPayment.findAll({
              where: {
                application_id: application.id,
                payment_status: {
                  [Op.in]: [
                    db.models.LandPayment.PAYMENT_STATUSES.PENDING,
                    db.models.LandPayment.PAYMENT_STATUSES.FAILED,
                  ],
                },
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (payments.length > 0) {
              throw new Error(
                "የክፍያ ጥያቄ ጸድቆ ሊደርስ በመጠባበቅ ላይ ወይም አልተሳካም ክፍያዎች ሊኖሩ አይችሉም።"
              );
            }
          }
        },
        afterUpdate: async (application, options) => {
          // Log additional actions (e.g., document upload, payment update) to action_log
          if (application.changed("land_record_id")) {
            application.action_log = [
              ...(application.action_log || []),
              {
                action: "LAND_RECORD_UPDATED",
                changed_by: application.updated_by,
                changed_at: new Date(),
              },
            ];
            await application.save({ transaction: options.transaction });
          }
        },
      },
      validate: {
        async validateApplicationType() {
          // Validate application_type consistency
          if (
            [
              APPLICATION_TYPES.OWNERSHIP_REGISTRATION,
              APPLICATION_TYPES.OWNERSHIP_TRANSFER,
              APPLICATION_TYPES.LEASE_REGISTRATION,
            ].includes(this.application_type) &&
            !this.land_record_id
          ) {
            throw new Error(
              "የባለቤትነት ምዝገባ፣ ሽግግር ወይም የኪራይ ምዝገባ የመሬት መዝገብ መለያ ይፈለጋል።"
            );
          }
        },
      },
    }
  );

  return Application;
};
//
