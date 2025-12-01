const RECORD_STATUSES = {
  SUBMITTED: "ተልኳል",
  APPROVED: "ጸድቋል",
  REJECTED: "ውድቅ ተደርጓል",
};
const LAND_PREPARATION= {
  LEASE: "ሊዝ",
  EXISTING: "ነባር"
}

const LAND_USE_TYPES = {
  RESIDENTIAL: "መኖሪያ",
  ORGANIZATION: "ድርጅት",
  MIXED: "ድብልቅ",
  COMMERCIAL: "ንግድ",
  ADMINISTRATIVE: "ለ አስተዳደር",
  GOVERNMENT_ORGANIZATION: "መንግስታዊ ተቋማት",
  KEBELE_HOUSE: "የቀበሌ ቤት",
  INDUSTRIAL: "ኢንዱስትሪ",
  MANUFACTURING_STORAGE: "ማምረቻ እና ማከማቻ",
  SERVICE: "ማህበራዊ አገልግሎት",
  INVESTMENT: "ኢንቨስትመንት",
  TRANSPORT: "መንገዶች እና ትራንስፖርት",
  URBAN_AGRICULTURE: "ከተማ ግብርና",
  FOREST: "ደንና አረጓዴ ቦታወች",
  RECREATION: "መዝናኛ እና መጫዎቻ",
  PROTECTED_AREA: "የተጠበቀ ክልል",
  OTHER: "የተለየ አገልግሎት",
};

const ZONING_TYPES = {
  CENTER_BUSINESS: "የንግድ ማዕከል",
  TRANSITION_ZONE: "የሽግግር ቀጠና",
  EXPANSION_ZONE: "የማስፋፊያ ቀጠና",
};

const OWNERSHIP_TYPES = {
  NO_PRIOR_DOCUMENT: "በሰነድ አልባ",
  AUCTION: "በጨረታ",
  ALLOCATION: "በምደባ/ምሪት",
  TRANSFER: "በስመንብረት ዝውውር",
  MERET_BANK: "መሬት ባንክ",
  COURT_ORDER: "በፍ/ቤት ትዕዛዝ",
  DISPLACEMENT: "በትክና ልዩልዩ",
};

const LEASE_TRANSFER_REASONS = {
  INHERITANCE: "በውርስ",
  BUY: "በግዥ",
  GIFT: "በስጦታ",
};

const INFRASTRUCTURE_STATUS = {
  FULLFILLED: "የተሟላለት",
  NOT_FULLFILLED: "ያልተሟላለት",
};

const LAND_HISTORY = {
  CONFISCATED: "ለልማት ባለመዋሉ ተነጥቆ ተመላሽ የተደረገ",
  COMPENSATED: "ከአርሶ አደር ይዞታ በካሳ ክፍያ የተገኘ",
  REDEVELOPMENT: "በመልሶ ልማት የተገኘ",
  VACANT: "በክፍትነት የቆየ",
  ILLEGAL: "ከህገወጥ ይዞታ ተመላሽ የሆነ",
  TEMPORARY: "በጊዜአዊነት ተሰጥቶ ዉል የተቋረጠ",
  OTHER: "ሌላ",
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
        allowNull: true,
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
            args: [["የግል", "የጋራ", "የመንግስት", "የድርጅት"]],
            msg: "የባለቤትነት ክፍል ከተፈቀዱት (የግል, የጋራ,የመንግስት,የድርጅት) ውስጥ አንዱ መሆን አለበት።",
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
      address_kebele: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የከተማ ክፍለ ከተማ መረጃ ከ0 እስከ 100 መሆን አለበት።" },
        },
      },
      address_ketena: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የቀጠና መረጃ ከ0 እስከ 100 መሆን አለበት።" },
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
      lease_transfer_reason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(LEASE_TRANSFER_REASONS)],
            msg: `የሊዝ ይዞታ ዝውውር ምክንያት ከተፈቀዱቷ (${Object.values(
              LEASE_TRANSFER_REASONS
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      land_preparation:{
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(LAND_PREPARATION)],
            msg: `የመሬት አዘጋጅት አይነት ከተፈቀዱት እሴቶች (${Object.values(
              LAND_PREPARATION
            ).join(", ")}) ውስጥ መሆን አለበት።`,
          },            
        },
      },
      //landbank specific attributes
      infrastructure_status: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      land_bank_code: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      land_history: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      other_land_history: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      landbank_registrer_name: {
        type: DataTypes.STRING,
        allowNull: true,
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
        defaultValue: RECORD_STATUSES.SUBMITTED,
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
                throw new Error("የተግባር መዝገብ የተቀየረበት ቀን ትክክለኛ መሆን አለበት።");
              }
              if (!entry.changed_by) {
                throw new Error("የተግባር መዝገብ ተቀያሪ መግለጥ አለበት።");
              }
            }
          },
        },
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      organization_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "organizations", key: "id" },
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
        { fields: ["infrastructure_status"] },
        { fields: ["land_history"] },
        { fields: ["land_level"] },
        { fields: ["lease_transfer_reason"] },
        { fields: ["block_number"] },
        { fields: ["record_status"] },
        { fields: ["created_by"] },
        { fields: ["approved_by"] },
      ],
    }
  );
  return {
    LandRecord,
    RECORD_STATUSES,
    LAND_USE_TYPES,
    LAND_PREPARATION,
    ZONING_TYPES,
    OWNERSHIP_TYPES,
    INFRASTRUCTURE_STATUS,
    LAND_HISTORY,
    LEASE_TRANSFER_REASONS,
  };
};
