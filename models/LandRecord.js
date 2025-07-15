const RECORD_STATUSES = {
  DRAFT: "ረቂቅ",
  SUBMITTED: "ተልኳል",
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
  ADMINISTRATIVE: "ለ አስተዳደር",
  SERVICE: "ማህበራዊ አገልግሎት",
  MANUFACTURING_STORAGE: "ማምረቻ እና ማከማቻ",
  TRANSPORT: "መንገዶች እና ትራንስፖርት",
  URBAN_AGRICULTURE: "ከተማ ግብርና",
  FOREST: "ደን",
  RECREATION: "መዝናኛ እና መጫዎቻ",
  PROTECTED_AREA: "የተጠበቀ ክልል",
  INDUSTRIAL: "ኢንዱስትሪ",
  OTHER: "ሌላ",
};

const ZONING_TYPES = {
  CENTER_BUSINESS: "የንግድ ማዕከል",
  TRANSITION_ZONE: "የሽግግር ቀጠና",
  EXPANSION_ZONE: "የማስፋት ቀጠና",
};

const OWNERSHIP_TYPES = {
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER: "ስመ ንብረት ማስተላለፍ",
  LEASE: "የሊዝ ይዞታ-በጨረታ",
  LEASE_ALLOCATION: "የሊዝ ይዞታ-በምደባ",
  NO_PRIOR_DOCUMENT: "ሰነድ አልባ ይዞታ",
  DISPLACEMENT: "በመፈናቀል ትክ",
  MERET_BANK: "የመሬት ባንክ",
  OTHERS: "ሌላ",
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
          len: { args: [1, 50], msg: "የመሬት ቁጥር ብዛት ከ1 እስከ 50  መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የመሬት ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
        },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "administrative_units", key: "id" },
      },
      ownership_category: {
        type: DataTypes.STRING, 
        allowNull: true,
        validate: {
          isIn: {
            args: [["የግል", "የጋራ"]],
            msg: "የባለቤትነት ክፍል ከተፈቀዱት (የግል, የጋራ ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
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
          len: { args: [0, 100], msg: "የሰሜን አዋሳኝ ከ0 እስከ 100  መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የሰሜን አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የሰሜን አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      east_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የምሥራቅ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የምሥራቅ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      south_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የደቡብ አዋሳኝ ከ0 እስከ 100  መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የደቡብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የደቡብ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      west_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የምዕራብ አዋሳኝ ከ0 እስከ 100  መሆን አለበት።" },
          isValidNeighbor(value) {
            if (value && !/^[a-zA-Z0-9\s-]+$/.test(value)) {
              throw new Error("የምዕራብ አዋሳኝ ፊደል፣ ቁጥር፣ ክፍተት ወይም ሰረዝ ብቻ መያዝ አለበት።");
            }
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የምዕራብ አዋሳኝ ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      notes:{
        type:DataTypes.STRING,
        allowNull:true,
      },
      block_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የብሎክ ቁጥር ከ0 እስከ 50  መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የቦታ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የቦታ ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      block_special_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የብሎክ ልዩ ስም ከ0 እስከ 100  መሆን አለበት።" },
          is: {
            args: /^[a-zA-Z0-9\s-]+$/,
            msg: "የብሎክ ልዩ ስም ፊደል፣ ቁጥር፣ ክፍተት ወዯም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የብሎክ ልዩ ስም ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: { args: [1], msg: "የመሬት ደረጃ ከ1 በታች መሆን አይችልም።" },
          max: { args: [5], msg: "የመሬት ደረጃ ከ5 በላይ መሆን አይችልም።" },
        },
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LAND_USE_TYPES)],
            msg: `የመሬት አጠቃቀም ከተፈቀዱት እሴቶች (${Object.values(LAND_USE_TYPES).join(
              ", "
            )}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      other_land_use: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "ሌላ የመሬት አጠቃቀም ከ0 እስከ 100  መሆን አለበት።" },
          is: {
            args: /^[a-zA-Z0-9\s,.-]+$/,
            msg: "ሌላ የመሬት አጠቃቀም ፊደል፣ ቁጥር፣ ክፍተት፣ እና ሰረዝ ብቻ መያዝ አለበት።",
          },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 200], msg: "የአድራሻ መረጃ ከ0 እስከ 200  መሆን አለበት።" },
          is: {
            args: /^[a-zA-Z0-9\s,.-]+$/,
            msg: "የአድራሻ መረጃ ፊደል፣ ቁጥር፣ ክፍተት፣ እና ሰረዝ ብቻ መያዝ አለበት።",
          },
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: `የባለቤትነት አይነት ከተፈቀዱት እሴቶች (${Object.values(
              OWNERSHIP_TYPES
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      other_ownership_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "ሌላ የመሬት የይዞታ ባለቤትነት አይነት ከ0 እስከ 100  መሆን አለበት።" },
          is: {
            args: /^[a-zA-Z0-9\s,.-]+$/,
            msg: "ሌላ የባለቤትነት አይነት ፊደል፣ ቁጥር፣ ክፍተት፣ እና ሰረዝ ብቻ መያዝ አለበት።",
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
            msg: `የመዝገብ ሁኔታ ከተፈቀዱት እሴቶች (${Object.values(RECORD_STATUSES).join(
              ", "
            )}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      zoning_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isValidZoningType(value) {
            if (
              value !== null &&
              !Object.values(ZONING_TYPES).includes(value)
            ) {
              throw new Error(
                `የመሬት ዞን ከተፈቀዱት  (${Object.values(ZONING_TYPES).join(
                  ", "
                )}) ውስጥ መሆን አለበት።`
              );
            }
          },
        },
      },
      status_history: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
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
            msg: `ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(
              ", "
            )}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      is_draft: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      notification_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: NOTIFICATION_STATUSES.NOT_SENT,
        validate: {
          isIn: {
            args: [Object.values(NOTIFICATION_STATUSES)],
            msg: `የማሳወቂያ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(
              NOTIFICATION_STATUSES
            ).join(", ")}) ውስጥ መሆን አለበት።`,
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
        { fields: ["land_use"] },
        { fields: ["other_land_use"] },
        { fields: ["ownership_type"] },
        { fields: ["other_ownership_type"] },
        { fields: ["block_number"] },
        { fields: ["record_status"] },
        { fields: ["priority"] },
        { fields: ["notification_status"] },
        { fields: ["created_by"] },
        { fields: ["approved_by"] },
      ],
    }
  );
  return {
    LandRecord,
    RECORD_STATUSES,
    NOTIFICATION_STATUSES,
    PRIORITIES,
    LAND_USE_TYPES,
    ZONING_TYPES,
    OWNERSHIP_TYPES,
  };
};
