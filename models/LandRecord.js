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
  FOREST: "ደንና አረጓዴ ቦታወች",
  RECREATION: "መዝናኛ እና መጫዎቻ",
  PROTECTED_AREA: "የተጠበቀ ክልል",
  INDUSTRIAL: "ኢንዱስትሪ",
  OTHER: "የተለየ አገልግሎት",
};

const ZONING_TYPES = {
  CENTER_BUSINESS: "የንግድ ማዕከል",
  TRANSITION_ZONE: "የሽግግር ቀጠና",
  EXPANSION_ZONE: "የማስፋፊያ ቀጠና",
};

const OWNERSHIP_TYPES = {
  NO_PRIOR_DOCUMENT: "በነባር ሰነድ አልባ የተያዘ ይዞታ",
  COURT_ORDER: "በፍ/ቤት ትዛዝ የተያዘ ይዞታ",
  DISPLACEMENT: "በትክና ልዩልዩ በነባር የተያዘ ይዞታ",
  MERET_BANK: "መሬት ባንክ የተደረገ ይዞታ",
  LEASE: "በሊዝ የተያዘ ይዞታ",
};

const LEASE_OWNERSHIP_TYPE = {
  LEASE_ALLOCATION: "በማህበር ምሪት በምደባ የተያዘ ይዞታ",
  MENORIYA_DRJIT: "በመኖሪያና ድርጅት በጨረታ የተያዘ ይዞታ",
  TRANSFER: "በስመ ንብረት ዝውውር የተያዘ ይዞታ",
  DISPLACEMENT_ALLOCATION: "በትክና ልዩልዩ በምደባ የተያዙ ይዞታወች",
  INVESTMENT_ALLOCATION: "በኢንቨስትመንት በምደባ የተያዘ ይዞታ",
};

const PROPERTY_OWNER_TYPE = {
  INSTITUTION: "ተቋም",
  LAND_BANK: "መሬት ባንክ",
  INDIVIDUALS: "የግለሰቦች",
};

const INFRASTRUCTURE_STATUS = {
  NOT_FULLFILLED: "የተሟላለት",
  NOT_FULLFILLED: "ያልተሟላለት",
};

const LAND_HISTORY = {
  CONFISCATED: "ለልማት ባለመዋሉ ተነጥቆ ተመላሽ የተደረገ",
  COMPENSATED: "ከአርሶ አደር ይዞታ በካሳ ክፍያ የተገኘ",
  REDEVELOPMENT: "በመልሶ ልማት የተገኘ",
  VACANT: "በክፍትነት የቆየ",
  ILLEGAL: "ከህገወጥ ይዞታ ተመላሽ የሆነ",
  TEMPORARY: "በጊዜአዊነት ተሰጥቶ ዉል የተቋረጠ",
  OTHER:"ሌላ"
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
        unique: true,
        validate: {
          notEmpty: { msg: "የመሬት ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 50], msg: "የመሬት ቁጥር ብዛት ከ1 እስከ 50 መሆን አለበት።" },
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
            msg: "የባለቤትነት ክፍል ከተፈቀዱት (የግል, የጋራ) ውስጥ አንዱ መሆን አለበት።",
          },
        },
      },
      building_hight: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: { args: [0.1], msg: "ስፋት ከ1 ካሬ ሜትር በታች መሆን አይችልም።" },
        },
      },
      has_debt: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      north_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የሰሜን አዋሳኝ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      east_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የምስራቅ አዋሳኝ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      south_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የደቡብ አዋሳኝ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      west_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የምዕራብ አዋሳኝ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      notes: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      deletion_reason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 200], msg: "የማጥፊያ ምክንያት ከ0 እስከ 200 መሆን አለበት።" },
        },
      },
      block_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የብሎክ ቁጥር ከ0 እስከ 50 መሆን አለበት።" },
        },
      },
      block_special_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የብሎክ ልዩ ስም ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: { args: [1], msg: "የመሬት ደረጃ ከ1 በታች መሆን አይችልም።" },
          max: { args: [5], msg: "የመሬት ደረጃ ከ5 በላይ መሆን አዯችልም።" },
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
      plan: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የፕላን ምደባ መረጃ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "የአድራሻ መረጃ ከ0 እስከ 500 መሆን አለበት።" },
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(OWNERSHIP_TYPES)],
            msg: `የይዞታ አግባብ አይነት ከተፈቀዱት እሴቶች (${Object.values(
              OWNERSHIP_TYPES
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      lease_ownership_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(LEASE_OWNERSHIP_TYPE)],
            msg: `የሊዝ ይዞታ አግባብ አይነት ከተፈቀዱቷ (${Object.values(
              LEASE_OWNERSHIP_TYPE
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      property_owner_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(PROPERTY_OWNER_TYPE)],
            msg: `የንብረት ባለቤት አይነት ከተፈቀዱቷ (${Object.values(
              PROPERTY_OWNER_TYPE
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      //landbank specific attributes
      infrastructure_status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isApplicable(value) {
            if (this.property_owner_type === PROPERTY_OWNER_TYPE.LAND_BANK && !value) {
              throw new Error("የመሠረተ ልማት ሁኔታ ለመሬት ባንክ መግለጽ አለበት።");
            }
            if (value && !Object.values(INFRASTRUCTURE_STATUS).includes(value)) {
              throw new Error(
                `የመሠረተ ልማት ሁኔታ ከተፈቀዱቷ (${Object.values(
                  INFRASTRUCTURE_STATUS
                ).join(", ")}) ውስጥ መሆን አለበት።`
              );
            }
          },
        },
      },
      land_bank_code: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isApplicable(value) {
            if (this.property_owner_type === PROPERTY_OWNER_TYPE.LAND_BANK && !value) {
              throw new Error("የመሬት ባንክ ኮድ ለመሬት ባንክ መግለጽ አለበት።");
            }
            if (value && value.length > 50) {
              throw new Error("የመሬት ባንክ ኮድ ከ50 ፊደላት መብለጥ አይችልም።");
            }
          },
        },
      },
      land_history: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isApplicable(value) {
            if (this.property_owner_type === PROPERTY_OWNER_TYPE.LAND_BANK && !value) {
              throw new Error("የመሬት ታሪክ ለመሬት ባንክ መግለጽ አለበት።");
            }
            if (value && !Object.values(LAND_HISTORY).includes(value)) {
              throw new Error(
                `የመሬት ታሪክ ከተፈቀዱቷ (${Object.values(LAND_HISTORY).join(
                  ", "
                )}) ውስጥ መሆን አለበት።`
              );
            }
          },
        },
      },
      landbank_registrer_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isApplicable(value) {
            if (this.property_owner_type === PROPERTY_OWNER_TYPE.LAND_BANK && !value) {
              throw new Error("የመሬት ባንክ መዝጋቢ ስም መግለጽ አለበት።");
            }
            if (value && value.length > 100) {
              throw new Error(
                "የመሬት ባንክ መዝጋቢ ስም ከ100 ፊደላት መብለጥ አይችልም።"
              );
            }
          },
        },
      },
      other_land_history:{
        type:DataTypes.STRING,
        allowNull:true,
      },
      //instituetion specific attributes
      institution_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isApplicable(value) {
            if (this.property_owner_type === PROPERTY_OWNER_TYPE.INSTITUTION && !value) {
              throw new Error("የተቋም ስም ለተቋም መግለጽ አለበት።");
            }
            if (value && value.length > 100) {
              throw new Error("የተቋም ስም ከ100 ፊደላት መብለጥ አይችልም።");
            }
          },
        },
      },
      remark: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "ምርመራ ከ0 እስከ 500 ፊደላት መሆን አለበት።" },
        },
      },
      record_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: RECORD_STATUSES.DRAFT,
        validate: {
          isIn: {
            args: [Object.values(RECORD_STATUSES)],
            msg: `የመዝገብ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(RECORD_STATUSES).join(
              ", "
            )}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      zoning_type: {
        type: DataTypes.STRING,
        allowNull: true,
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
                throw new Error(
                  "የተግባር መዝገብ የተቀየረበት ቀን ትክክለኛ መሆን አለበት።"
                );
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
        { fields: ["ownership_type"] },
        { fields: ["block_number"] },
        { fields: ["record_status"] },
        { fields: ["priority"] },
        { fields: ["notification_status"] },
        { fields: ["created_by"] },
        { fields: ["approved_by"] },
        { fields: ["property_owner_type"] },
      ],
    }
  );
  return {
    LandRecord,
    RECORD_STATUSES,
    LEASE_OWNERSHIP_TYPE,
    NOTIFICATION_STATUSES,
    PRIORITIES,
    LAND_USE_TYPES,
    ZONING_TYPES,
    OWNERSHIP_TYPES,
    PROPERTY_OWNER_TYPE,
    INFRASTRUCTURE_STATUS,
    LAND_HISTORY,
  };
};