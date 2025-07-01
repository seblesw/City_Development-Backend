const { Op } = require("sequelize");

// Defining constants for record statuses in Amharic
const RECORD_STATUSES = {
  DRAFT: "ረቂቅ",
  SUBMITTED: "ቀርቧል",
  UNDER_REVIEW: "በግምገማ ላይ",
  APPROVED: "ጸድቋል",
  REJECTED: "ውድቅ ተደርጓል",
};

// Defining constants for priorities in Amharic
const PRIORITIES = {
  LOW: "ዝቅተኛ",
  MEDIUM: "መካከለኛ",
  HIGH: "ከፍተኛ",
};

// Defining constants for notification statuses in Amharic
const NOTIFICATION_STATUSES = {
  NOT_SENT: "አልተላከም",
  SENT: "ተልኳል",
  FAILED: "አልተሳካም",
};

// Defining constants for land use types in Amharic
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

// Defining constants for zoning types in Amharic
const ZONING_TYPES = {
  CENTER_BUSINESS: "የንግድ ማዕከል",
  TRANSITION_ZONE: "የሽግግር ቀጠና",
  EXPANSION_ZONE: "የማስፋት ቀጠና",
};

// Defining constants for ownership types in Amharic
const OWNERSHIP_TYPES = {
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER: "የባለቤትነት ማስተላለፍ",
  LEASE: "የሊዝ ጨረታ-ይዞታ",
  LEASE_ALLOCATION: "የሊዝ ይዞታ-ምደባ",
  NO_PRIOR_DOCUMENT: "ቅድመ ሰነድ የሌለው",
  DISPLACEMENT: "መፈናቀል",
  MERET_BANK: "መሬት ባንክ",
};

module.exports = (db, DataTypes) => {
  // Defining the LandRecord model
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
          min: { args: [1], msg: "የመሬት ደረጃ ከ1 በታች መሆን አይችልም።" },
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
          min: { args: [0.1], msg: "ስፋት ከ0.1 ካሬ ሜትር በታች መሆን አይችልም።" },
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
              throw new Error("የደቡብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የደቡብ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
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
              throw new Error("የምዕራብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የምዕራብ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
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
            msg: "የቦታ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የቦታ ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
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
            msg: "የቦታ ልዩ ስም ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የቦታ ልዩ ስም ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LAND_USE_TYPES)],
            msg: `የመሬት አጠቃቀም ከተፈቀዱት እሴቶች (${Object.values(LAND_USE_TYPES).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: `የባለቤትነት አይነት ከተፈቀዱት እሴቶች (${Object.values(OWNERSHIP_TYPES).join(", ")}) ውስጥ መሆን አለበት።`,
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
              if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 8) {
                throw new Error("ኮርድኔት ትክክለኛነት ከ8 አስርዮሽ ቦታዎች መብለጥ አይችልም።");
              }
            }
            if (value.type === "Polygon") {
              if (!Array.isArray(value.coordinates) || !value.coordinates.every((ring) => Array.isArray(ring))) {
                throw new Error("Polygon መጋጠሚያ ትክክል አይደለም።");
              }
              const [outerRing] = value.coordinates;
              if (outerRing.length < 4 || JSON.stringify(outerRing[0]) !== JSON.stringify(outerRing[outerRing.length - 1])) {
                throw new Error("Polygon ውጫዊ ቀለበት መዘጋት አለበት።");
              }
              for (const [lon, lat] of outerRing) {
                if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
                  throw new Error("Polygon ኮርድኔት የተሳሳተ ነው።");
                }
                if (typeof lon === "number" && lon.toString().split(".")[1]?.length > 8) {
                  throw new Error("Polygon ኮርድኔት ትክክለኛነት ከ8 አስርዮሽ ቦታዎች መብለጥ አይችልም።");
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
            msg: `የመዝገብ ሁኔታ ከተፈቀዱት እሴቶች (${Object.values(RECORD_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      plot_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የመሬት ክፍል ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የመሬት ክፍል ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "") throw new Error("የመሬት ክፍል ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      zoning_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isValidZoningType(value) {
            if (value !== null && !Object.values(ZONING_TYPES).includes(value)) {
              throw new Error(`የመሬት ዞን ከተፈቀዱት እሴቶች (${Object.values(ZONING_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
            }
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
                throw new Error(`የሁኔታ ታሪክ ሁኔታ ከተፈቀዱት እሴቶች (${Object.values(RECORD_STATUSES).join(", ")}) መሆን አለበት።`);
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
            msg: `ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(", ")}) ውስጥ መሆን አለበት።`,
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
      notification_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: NOTIFICATION_STATUSES.NOT_SENT,
        validate: {
          isIn: {
            args: [Object.values(NOTIFICATION_STATUSES)],
            msg: `የማሳወቂያ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(NOTIFICATION_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`,
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
        { fields: ["approved_by"] },
      ],
      hooks: {
        beforeCreate: async (landRecord, options) => {
          // Validating creator role
          const creator = await db.models.User.findByPk(landRecord.created_by, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction,
          });
          if (!creator || !["መዝጋቢ", "አስተዳደር"].includes(creator.role?.name)) {
            throw new Error("መዝገብ መፍጠር የሚችሉት መዝጋቢ ወይም አስተዳደር ብቻ ናቸው።");
          }

          // Validating administrative unit and land level
          const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
            transaction: options.transaction,
          });
          if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
          if (landRecord.land_level > adminUnit.max_land_levels) {
            throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
          }

          // Validating primary owner
          const user = await db.models.User.findByPk(landRecord.user_id, {
            transaction: options.transaction,
          });
          if (!user || user.primary_owner_id !== null) {
            throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
          }

          // Ensuring administrative unit consistency with user
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
          }

          // Checking block number uniqueness
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

          // Checking parcel number uniqueness
          const existingParcel = await db.models.LandRecord.findOne({
            where: {
              parcel_number: landRecord.parcel_number,
              administrative_unit_id: landRecord.administrative_unit_id,
              deleted_at: { [Op.eq]: null },
            },
            transaction: options.transaction,
          });
          if (existingParcel) throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");

          // Initializing status history and action log
          landRecord.status_history = [
            {
              status: landRecord.record_status,
              changed_by: landRecord.created_by,
              changed_at: landRecord.createdAt || new Date(),
            },
          ];
          landRecord.action_log = [
            {
              action: "CREATED",
              changed_by: landRecord.created_by,
              changed_at: landRecord.createdAt || new Date(),
            },
          ];
        },
        beforeUpdate: async (landRecord, options) => {
          // Validating updater role
          if (landRecord.changed("updated_by") && landRecord.updated_by) {
            const updater = await db.models.User.findByPk(landRecord.updated_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!updater || !["መዝጋቢ", "አስተዳደር"].includes(updater.role?.name)) {
              throw new Error("መዝገብ መቀየር የሚችሉት መዝጋቢ ወይም አስተዳደር ብቻ ናቸው።");
            }
          }

          // Validating approver role
          if (landRecord.changed("approved_by") && landRecord.approved_by) {
            const approver = await db.models.User.findByPk(landRecord.approved_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!approver || !["አስተዳደር"].includes(approver.role?.name)) {
              throw new Error("መዝገብ ማፅደቅ የሚችሉት አስተዳደር ብቻ ናቸው።");
            }
          }

          // Validating status transitions
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
              throw new Error(`ከ${previousStatus} ወደ ${landRecord.record_status} መሸጋገር አይችልም።`);
            }

            // Ensuring document exists for SUBMITTED status
            if (landRecord.record_status === RECORD_STATUSES.SUBMITTED) {
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

            // Handling approval and rejection logic
            if (landRecord.record_status === RECORD_STATUSES.APPROVED) {
              if (!landRecord.updated_by) throw new Error("ጸድቋል ሁኔታ የተቀየረበት ተጠቃሚ ይፈለጋል።");
              landRecord.approved_by = landRecord.updated_by;
            } else {
              landRecord.approved_by = null;
            }

            if (landRecord.record_status === RECORD_STATUSES.REJECTED) {
              if (!landRecord.rejection_reason) {
                throw new Error("ውድቅ ሁኔታ የውድቅ ምክንያት ይፈለጋል።");
              }
            } else if (previousStatus === RECORD_STATUSES.REJECTED && landRecord.record_status === RECORD_STATUSES.SUBMITTED) {
              landRecord.rejection_reason = null;
            }

            // Updating status history and resetting notification status
            landRecord.status_history = [
              ...(landRecord.status_history || []),
              {
                status: landRecord.record_status,
                changed_by: landRecord.updated_by,
                changed_at: landRecord.updatedAt || new Date(),
              },
            ];
            landRecord.notification_status = NOTIFICATION_STATUSES.NOT_SENT;
          }

          // Logging notification status changes
          if (landRecord.changed("notification_status")) {
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: `NOTIFICATION_STATUS_CHANGED_TO_${landRecord.notification_status}`,
                changed_by: landRecord.updated_by,
                changed_at: landRecord.updatedAt || new Date(),
              },
            ];
          }

          // Validating administrative unit and land level on update
          if (landRecord.changed("administrative_unit_id") || landRecord.changed("land_level")) {
            const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
              transaction: options.transaction,
            });
            if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
            if (landRecord.land_level > adminUnit.max_land_levels) {
              throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
            }
          }

          // Validating user and administrative unit alignment
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

          // Checking block number uniqueness on update
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

          // Checking parcel number uniqueness on update
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

          // Logging updates in action log
          if (landRecord.changed()) {
            const changedFields = landRecord.changed();
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: "LAND_RECORD_UPDATED",
                changed_by: landRecord.updated_by,
                changed_at: landRecord.updatedAt || new Date(),
                changed_fields: changedFields,
              },
            ];
          }
        },
        beforeDestroy: async (landRecord, options) => {
          // Validating deleter role
          if (landRecord.deleted_by) {
            const deleter = await db.models.User.findByPk(landRecord.deleted_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!deleter || !["አስተዳደር"].includes(deleter.role?.name)) {
              throw new Error("መዝገብ መሰረዝ የሚችሉት አስተዳደር ብቻ ናቸው።");
            }

            // Logging deletion in action log
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: "DELETED",
                changed_by: landRecord.deleted_by,
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
      },
    }
  );

  // Exporting model and constants
  return { LandRecord, RECORD_STATUSES, NOTIFICATION_STATUSES, PRIORITIES, LAND_USE_TYPES, ZONING_TYPES, OWNERSHIP_TYPES };
};