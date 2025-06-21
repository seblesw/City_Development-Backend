const APPLICATION_STATUSES = {
  DRAFT: "ረቂቅ",
  SUBMITTED: "ቀርቧል",
  UNDER_REVIEW: "በግምገማ ላይ",
  APPROVED: "ጸድቋል",
  REJECTED: "ውድቅ ተደርጓል"
};

const APPLICATION_TYPES = {
  OWNERSHIP_REGISTRATION: "የባለቤትነት ምዝገባ",
  OWNERSHIP_TRANSFER: "የባለቤትነት ሽግግር",
  LEASE_REGISTRATION: "የኪራይ ምዝገባ",
  PAYMENT_REQUEST: "የክፍያ ጥያቄ",
  OTHER: "ሌላ"
};

const PRIORITIES = {
  LOW: "ዝቅተኛ",
  MEDIUM: "መካከለኛ",
  HIGH: "ከፍተኛ"
};

module.exports = (db, DataTypes) => {
  const Application = db.define(
    "Application",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      application_code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የመጠየቂያ ኮድ ባዶ መሆን አይቻልም።" },
          len: { args: [7, 20], msg: "የመጠየቂያ ኮድ ከ7 እስከ 20 ቁምፊዎች መሆን አለበት።" }
        }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" }
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_records", key: "id" }
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: APPLICATION_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_STATUSES)],
            msg: "የመጠየቂያ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      status_history: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: []
      },
      application_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(APPLICATION_TYPES)],
            msg: "የመጠየቂያ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      priority: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: PRIORITIES.MEDIUM,
        validate: {
          isIn: {
            args: [Object.values(PRIORITIES)],
            msg: "ቅድሚያ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      rejection_reason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "የውድቅ ምክንያት ከ500 ቁምፊዎች መብለጥ አይቻልም።" }
        }
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      rejected_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" }
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" }
      },
      deleted_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" }
      }
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
        { fields: ["land_record_id"] },
        { fields: ["status"] },
        { fields: ["application_type"] },
        { fields: ["priority"] }
      ],
      hooks: {
        beforeCreate: async (application, options) => {
          // Fetch administrative unit name for application_code
          const adminUnit = await db.models.AdministrativeUnit.findByPk(application.administrative_unit_id, {
            transaction: options.transaction
          });
          if (!adminUnit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
          const prefix = adminUnit.name.slice(0, 3).toUpperCase();
          const random = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit random number
          application.application_code = `${prefix}000${random}`;
          // Ensure application_code is unique
          const existing = await db.models.Application.findOne({
            where: { application_code: application.application_code },
            transaction: options.transaction
          });
          if (existing) throw new Error("የመጠየቂያ ኮድ አስቀድመው ጥቅም ላይ ውሏል።");
          // Validate created_by role
          const creator = await db.models.User.findByPk(application.created_by, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction
          });
          if (!creator || !["መመዝገቢ", "አስተዳደር"].includes(creator.role.name)) {
            throw new Error("መጠየቂያ መፍጠር የሚችሉት መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
          }
          // Validate administrative_unit_id
          const owner = await db.models.User.findByPk(application.user_id, {
            transaction: options.transaction
          });
          if (!owner) throw new Error("ተጠቃሚ አልተገኘም።");
          if (
            creator.administrative_unit_id !== owner.administrative_unit_id ||
            creator.administrative_unit_id !== application.administrative_unit_id
          ) {
            throw new Error("አስተዳደራዊ ክፍል ከመመዝገቢው እና ተጠቃሚ ጋር መመሳሰል አለበት።");
          }
          // Validate land_record_id
          if (application.land_record_id) {
            const landRecord = await db.models.LandRecord.findByPk(application.land_record_id, {
              transaction: options.transaction
            });
            if (!landRecord) throw new Error("የመሬት መዝገብ አልተገኘም።");
            if (
              (landRecord.application_id !== null && landRecord.application_id !== application.id) ||
              landRecord.administrative_unit_id !== application.administrative_unit_id ||
              landRecord.user_id !== application.user_id
            ) {
              throw new Error("የመሬት መዝገብ ከመጠየቂያ፣ ተጠቃሚ እና አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።");
            }
          }
          // Validate co-owners
          const coOwnersCount = await db.models.User.count({
            where: { primary_owner_id: application.user_id },
            transaction: options.transaction
          });
          if (owner.marital_status === "ባለትዳር" && coOwnersCount !== 1) {
            throw new Error("ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።");
          } else if (["ቤተሰብ", "የጋራ ባለቤትነት"].includes(owner.marital_status) && coOwnersCount < 1) {
            throw new Error(`${owner.marital_status} ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።`);
          } else if (owner.marital_status === "ነጠላ" && coOwnersCount > 0) {
            throw new Error("ነጠላ ተጠቃሚ የጋራ ባለቤት መኖር አይቻልም።");
          }
          // Initialize status_history
          application.status_history = [
            { status: APPLICATION_STATUSES.DRAFT, changed_by: application.created_by, changed_at: new Date() }
          ];
        },
        beforeUpdate: async (application, options) => {
          // Validate status transitions
          const validTransitions = {
            [APPLICATION_STATUSES.DRAFT]: [APPLICATION_STATUSES.SUBMITTED],
            [APPLICATION_STATUSES.SUBMITTED]: [APPLICATION_STATUSES.UNDER_REVIEW],
            [APPLICATION_STATUSES.UNDER_REVIEW]: [APPLICATION_STATUSES.APPROVED, APPLICATION_STATUSES.REJECTED],
            [APPLICATION_STATUSES.APPROVED]: [],
            [APPLICATION_STATUSES.REJECTED]: []
          };
          if (application.changed("status")) {
            const previousStatus = application.previous("status");
            if (!validTransitions[previousStatus].includes(application.status)) {
              throw new Error(`ከ${previousStatus} ወደ ${application.status} መሸጋገር አይቻልም።`);
            }
            // Validate updated_by role
            const updater = await db.models.User.findByPk(application.updated_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction
            });
            if (!updater || !["መመዝገቢ", "አስተዳደር"].includes(updater.role.name)) {
              throw new Error("መጠየቂያ መቀየር የሚችሉት መመዝገቢ ወይም አስተዳደር ብቻ ናቸው።");
            }
            application.status_history = [
              ...(application.status_history || []),
              { status: application.status, changed_by: application.updated_by, changed_at: new Date() }
            ];
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
                throw new Error("ውድቅ ሁኔታ የውድቅ ምክንያት ይፈልጋል።");
              }
            }
          }
          // Ensure land_record_id for SUBMITTED status
          if (application.status === APPLICATION_STATUSES.SUBMITTED && !application.land_record_id) {
            throw new Error("ቀርቧል ሁኔታ የመሬት መዝገብ መለያ ይፈልጋል።");
          }
          // Validate co-owners and administrative_unit_id on user_id or administrative_unit_id change
          if (application.changed("user_id") || application.changed("administrative_unit_id")) {
            const owner = await db.models.User.findByPk(application.user_id, { transaction: options.transaction });
            const adminUnit = await db.models.AdministrativeUnit.findByPk(application.administrative_unit_id, {
              transaction: options.transaction
            });
            if (!owner || !adminUnit) throw new Error("ተጠቃሚ ወይም አስተዳደራዊ ክፍል አልተገኘም።");
            if (owner.administrative_unit_id !== application.administrative_unit_id) {
              throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
            }
            const coOwnersCount = await db.models.User.count({
              where: { primary_owner_id: application.user_id },
              transaction: options.transaction
            });
            if (owner.marital_status === "ባለትዳር" && coOwnersCount !== 1) {
              throw new Error("ባለትዳር ተጠቃሚ በትክክል አንድ የጋራ ባለቤት መኖር አለበት።");
            } else if (["ቤተሰብ", "የጋራ ባለቤትነት"].includes(owner.marital_status) && coOwnersCount < 1) {
              throw new Error(`${owner.marital_status} ተጠቃሚ ቢያንስ አንድ የጋራ ባለቤት መኖር አለበት።`);
            } else if (owner.marital_status === "ነጠላ" && coOwnersCount > 0) {
              throw new Error("ነጠላ ተጠቃሚ የጋራ ባለቤት መኖር አይቻልም።");
            }
          }
        }
      }
    }
  );

  return Application;
};