const { Op } = require("sequelize");

const RECORD_STATUSES = {
  DRAFT: "ረቂቅ",
  SUBMITTED: "ቀርቧል",
  UNDER_REVIEW: "በግምገማ ላይ",
  APPROVED: "ጸድቋል",
  REJECTED: "ውድቅ ተደርጓል",
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

const LAND_USE_TYPES = {
  RESIDENTIAL: "መኖሪያ",
  MIXED: "ድብልቅ",
  COMMERCIAL: "ንግድ",
  ADMINISTRATIVE: "አስተዳደራዊ",
  SERVICE: "አገልግሎት",
  MANUFACTURING_STORAGE: "ማምረቻ እና ማከማቻ",
  TRANSPORT: "መንገዶች እና ትራንስፖርት",
  URBAN_AGRICULTURE: "ከተማ ግብርና",
  FOREST: "ደን",
  RECREATION: "መዝናኛ",
  OTHER: "ሌላ",
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER: "የባለቤትነት ማስተላለፍ",
  LEASE: "የሊዝ ይዞታ",
  LEASE_ALLOCATION: "የሊዝ ይዞታ-ምደባ",
  NO_PRIOR_DOCUMENT: "ቅድመ ሰነድ የሌለው",
  DISPLACEMENT: "መፈናቀል",
  MERET_BANK: "መሬት ባንክ",
};

module.exports = (db, DataTypes) => {
  const LandRecord = db.define(
    "LandRecord",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      parcel_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የመሬት ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 50], msg: "የመሬት ቁጥር ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የመሬት ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
        },
      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: { args: [1], msg: "ማህበረ ደረጃ ከ1 በታች መሆን አይችልም።" },
        },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: { args: [0.1], msg: "ስፋት ከ0.1 ካሬ ሜትር በታች መሆን አዯችልም።" },
        },
      },
      north_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የሰሜን አዋሳኝ ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የሰሜን አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የሰሜን አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      east_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የምሥራቅ አዋሳኝ ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የምሥራቅ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የምሥራቅ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      south_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የደቡብ አዋሳኝ ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የደቡብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወዯም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የደቡብ አዋሳኝ ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      west_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የምዕራብ አዋሳኝ ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የምዕራብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወዯም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የምዕራብ አዋሳኝ ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      block_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የቦታ ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የቦታ ቁጥር ፊደል፣ ቁጥር ወዯም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የቦታ ቁጥር ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      block_special_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የቦታ ልዩ ስም ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[a-zA-Z0-9\s-]+$/,
            msg: "የቦታ ልዩ ስም ፊደል፣ ቁጥር፣ ክፍተት ወዯም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የቦታ ልዩ ስም ባዶ መሆን አዯችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LAND_USE_TYPES)],
            msg: "የመሬት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: "የባለቤትነት አዯነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (!value) return;
            if (!["Point", "Polygon"].includes(value.type)) {
              throw new Error("ትክክለኛ GeoJSON መሆን አለበት።");
            }
            if (value.type === "Point") {
              const [lon, lat] = value.coordinates;
              if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                throw new Error("ኮርድኔት የተሳሳተ ነው።");
              }
              if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 6) {
                throw new Error("ኮርድኔት ትክክለኛነት ከ6 አስርዮሽ ቦታዎች መብለጥ አዯችልም።");
              }
            }
            if (value.type === "Polygon") {
              if (!Array.isArray(value.coordinates) || !value.coordinates.every((ring) => Array.isArray(ring))) {
                throw new Error("Polygon መጋጠሚያ ትክክል አዯደለም።");
              }
              const [outerRing] = value.coordinates;
              if (outerRing.length < 4 || JSON.stringify(outerRing[0]) !== JSON.stringify(outerRing[outerRing.length - 1])) {
                throw new Error("Polygon ውጫዊ ቀለበት መዘጋት አለበት።");
              }
              for (const [lon, lat] of outerRing) {
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                  throw new Error("Polygon ኮርድኔት የተሳሳተ ነው።");
                }
                if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 6) {
                  throw new Error("Polygon ኮርድኔት ትክክለኛነት ከ6 አስርዮሽ ቦታዎች መብለጥ አዯችልም።");
                }
              }
            }
          },
        },
      },
      record_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: RECORD_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(RECORD_STATUSES)],
            msg: "የመዝገብ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።",
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
              if (!entry.status || !Object.values(RECORD_STATUSES).includes(entry.status)) {
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
        allowNull: true,
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
      priority: {
        type: DataTypes.STRING,
        allowNull: true,
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
          len: { args: [0, 500], msg: "የውድቅ ምክንያት ከ500 ቁምፊዎች መብለጥ አዯችልም።" },
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
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
          notFutureDate(value) {
            const today = new Date();
            if (value && new Date(value) > today) {
              throw new Error("የገባበት ቀን ወደፊት መሆን አዯችልም።");
            }
          },
        },
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
          notFutureDate(value) {
            const today = new Date();
            if (value && new Date(value) > today) {
              throw new Error("የጸደቀበት ቀን ወደፊት መሆን አዯችልም።");
            }
          },
        },
      },
      rejected_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
          notFutureDate(value) {
            const today = new Date();
            if (value && new Date(value) > today) {
              throw new Error("ውድቅ የተደረገበት ቀን ወደፊት መሆን አዯችልም።");
            }
          },
        },
      },
      last_notified_at: {
        type: DataTypes.DATE,
        allowNull: true,
        validate: {
          isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
          notFutureDate(value) {
            const today = new Date();
            if (value && new Date(value) > today) {
              throw new Error("የመጨረሻ ማሳወቂያ ቀን ወደፊት መሆን አዯችልም።");
            }
          },
        },
      },
    },
    {
      tableName: "land_records",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["parcel_number", "administrative_unit_id"] },
        { fields: ["administrative_unit_id"] },
        { fields: ["user_id"] },
        { fields: ["land_use"] },
        { fields: ["ownership_type"] },
        { fields: ["block_number"] },
        { fields: ["record_status"] },
        { fields: ["priority"] },
        { fields: ["notification_status"] },
        { fields: ["created_by"] },
        { fields: ["submitted_at"] },
        { fields: ["approved_at"] },
        { fields: ["rejected_at"] },
        { fields: ["last_notified_at"] },
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Validate created_by role
          const creator = await db.models.User.findByPk(landRecord.created_by, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction,
          });
          if (!creator || !["መመዝገቢ", "አስተዳደር"].includes(creator.role?.name)) {
            throw new Error("መዝገብ መፍጠር የሚችሉት መመዝገቢ ወዯም አስተዳደር ብቻ ናቸው።");
          }

          // Validate administrative_unit_id
          const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
            transaction: options.transaction,
          });
          if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

          // Validate land_level against max_land_levels
          if (landRecord.land_level > adminUnit.max_land_levels) {
            throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።");
          }

          // Validate user_id (primary owner)
          const user = await db.models.User.findByPk(landRecord.user_id, {
            transaction: options.transaction,
          });
          if (!user || user.primary_owner_id !== null) {
            throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
          }

          // Validate administrative_unit_id consistency with user
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
          }

          // Validate block_number uniqueness within administrative_unit_id
          if (landRecord.block_number) {
            const existingBlock = await db.models.LandRecord.findOne({
              where: {
                block_number: landRecord.block_number,
                administrative_unit_id: landRecord.administrative_unit_id,
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (existingBlock) throw new Error("ይህ የቦታ ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
          }

          // Validate parcel_number uniqueness within administrative_unit_id
          const existingParcel = await db.models.LandRecord.findOne({
            where: {
              parcel_number: landRecord.parcel_number,
              administrative_unit_id: landRecord.administrative_unit_id,
              deleted_at: { [Op.eq]: null },
            },
            transaction: options.transaction,
          });
          if (existingParcel) throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");

          // Initialize status_history and action_log
          landRecord.status_history = [
            {
              status: landRecord.record_status,
              changed_by: landRecord.created_by,
              changed_at: new Date(),
            },
          ];
          landRecord.action_log = [
            {
              action: "CREATED",
              changed_by: landRecord.created_by,
              changed_at: new Date(),
            },
          ];
        },
        beforeUpdate: async (landRecord, options) => {
          // Validate status transitions
          const validTransitions = {
            [RECORD_STATUSES.DRAFT]: [RECORD_STATUSES.SUBMITTED],
            [RECORD_STATUSES.SUBMITTED]: [RECORD_STATUSES.UNDER_REVIEW],
            [RECORD_STATUSES.UNDER_REVIEW]: [RECORD_STATUSES.APPROVED, RECORD_STATUSES.REJECTED],
            [RECORD_STATUSES.REJECTED]: [RECORD_STATUSES.SUBMITTED],
            [RECORD_STATUSES.APPROVED]: [],
          };
          if (landRecord.changed("record_status")) {
            const previousStatus = landRecord.previous("record_status");
            if (!validTransitions[previousStatus]?.includes(landRecord.record_status)) {
              throw new Error(`ከ${previousStatus} ወደ ${landRecord.record_status} መሸጋገር አዯችልም።`);
            }

            // Validate updated_by role
            const updater = await db.models.User.findByPk(landRecord.updated_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!updater || !["መመዝገቢ", "አስተዳደር"].includes(updater.role?.name)) {
              throw new Error("መዝገብ መቀየር የሚችሉት መመዝገቢ ወዯም አስተዳደር ብቻ ናቸው።");
            }

            // Update status_history and action_log
            landRecord.status_history = [
              ...(landRecord.status_history || []),
              {
                status: landRecord.record_status,
                changed_by: landRecord.updated_by,
                changed_at: new Date(),
              },
            ];
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: `STATUS_CHANGED_TO_${landRecord.record_status}`,
                changed_by: landRecord.updated_by,
                changed_at: new Date(),
              },
            ];

            // Reset notification_status on status change
            landRecord.notification_status = NOTIFICATION_STATUSES.NOT_SENT;

            // Update timestamps and approved_by
            if (landRecord.record_status === RECORD_STATUSES.SUBMITTED) {
              landRecord.submitted_at = new Date();
              const documents = await db.models.Document.findOne({
                where: {
                  land_record_id: landRecord.id,
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (!documents) {
                throw new Error("ቀርቧል ሁኔታ ቢያንስ አንድ ሰነድ ይፈለጋል።");
              }
            }
            if (landRecord.record_status === RECORD_STATUSES.APPROVED) {
              landRecord.approved_at = new Date();
              landRecord.approved_by = landRecord.updated_by;
            }
            if (landRecord.record_status === RECORD_STATUSES.REJECTED) {
              landRecord.rejected_at = new Date();
              if (!landRecord.rejection_reason) {
                throw new Error("ውድቅ ሁኔታ የውድቅ ምክንያት ይፈለጋል።");
              }
            }

            // Clear rejection_reason when transitioning from REJECTED to SUBMITTED
            if (
              previousStatus === RECORD_STATUSES.REJECTED &&
              landRecord.record_status === RECORD_STATUSES.SUBMITTED
            ) {
              landRecord.rejection_reason = null;
              landRecord.rejected_at = null;
            }
          }

          // Validate administrative_unit_id on update
          if (landRecord.changed("administrative_unit_id") || landRecord.changed("land_level")) {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
              transaction: options.transaction,
            });
            if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
            if (landRecord.land_level > adminUnit.max_land_levels) {
              throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።");
            }
          }

          // Validate user_id and administrative_unit_id alignment
          if (landRecord.changed("user_id") || landRecord.changed("administrative_unit_id")) {
            const user = await db.models.User.findByPk(landRecord.user_id, {
              transaction: options.transaction,
            });
            if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
            if (user.primary_owner_id !== null) {
              throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
            }
            if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
            }
          }

          // Validate block_number uniqueness on update
          if (landRecord.changed("block_number") || landRecord.changed("administrative_unit_id")) {
            if (landRecord.block_number) {
              const existingBlock = await db.models.LandRecord.findOne({
                where: {
                  block_number: landRecord.block_number,
                  administrative_unit_id: landRecord.administrative_unit_id,
                  id: { [Op.ne]: landRecord.id },
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existingBlock) throw new Error("ይህ የቦታ ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
            }
          }

          // Validate parcel_number uniqueness on update
          if (landRecord.changed("parcel_number") || landRecord.changed("administrative_unit_id")) {
            const existingParcel = await db.models.LandRecord.findOne({
              where: {
                parcel_number: landRecord.parcel_number,
                administrative_unit_id: landRecord.administrative_unit_id,
                id: { [Op.ne]: landRecord.id },
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (existingParcel) throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
          }
        },
        afterUpdate: async (landRecord, options) => {
          // Log additional actions (e.g., document upload, payment update) to action_log
          if (
            landRecord.changed("user_id") ||
            landRecord.changed("administrative_unit_id") ||
            landRecord.changed("parcel_number")
          ) {
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: "LAND_RECORD_UPDATED",
                changed_by: landRecord.updated_by,
                changed_at: new Date(),
              },
            ];
            await landRecord.save({ transaction: options.transaction });
          }
        },
      },
      validate: {
        atLeastOneNeighbor() {
          if (
            !this.north_neighbor &&
            !this.east_neighbor &&
            !this.south_neighbor &&
            !this.west_neighbor
          ) {
            throw new Error("ቢያንስ አንድ ጎረቤት መግለጥ አለበት።");
          }
        },
        async validLandLevel() {
          const adminUnit = await db.models.AdministrativeUnit.findByPk(this.administrative_unit_id);
          if (adminUnit && this.land_level > adminUnit.max_land_levels) {
            throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አዯችልም።");
          }
        },
      },
    }
  );

  return LandRecord;
};