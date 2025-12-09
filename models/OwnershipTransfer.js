const { Model } = require("sequelize");

// models/OwnershipTransfer.js
const PROPERTY_USE = {
  RESIDENTIAL: "መኖሪያ",
  ORGANIZATION: "ድርጅት",
  MIXED: "ቅይጥ",
};

const SALE_OR_GIFT_SUB = {
  LEASE: "በሊዝ ይዞታ",
  EXISTING: "በነባር ይዞታ",
};

const TRANSFER_TYPE = {
  SALE_OR_GIFT: "በሽያጭ ወይም በስጦታ",
  BANK_FORECLOSURE: "በባንክ ሐራጅ",
  COURT_DECISION: "በፍርድ ዉሳኔ",
  CONDOMINIUM: "የጋራ ህንጻ ኮንዶሚኒየም",
  RESIDENTIAL_ASSOCIATION: "የመኖሪያ ቤት ህብረት ስራ ማህበር",
  INHERITANCE: "በውርስ የተገኘ",
  REALSTATE_HOUSE: "የሪልስቴት ቤት",
  TRADE_ORGANIZATION: "የንግድ ማህበር አደረጃጀት",
};

const INHERITANCE_RELATION = {
  CHILD: "ከልጅ ወደ ወላጅ",
  PARENT: "ከወላጅ ወደ ልጅ",
  OTHER: "ሌላ",
};

const TRANSFER_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  COMPLETED: "completed",
};

module.exports = (db, DataTypes) => {
  const OwnershipTransfer = db.define(
    "OwnershipTransfer",
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

      // Recipient Info (new owner)
      recipient_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        comment:
          "Reference to new owner (user). If null, recipient info should be filled manually",
      },

      // Optional manual recipient info (for non-registered users)
      recipient_full_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 100], msg: "የተቀባይ ስም ከ100 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      recipient_phone: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 20], msg: "የተቀባይ ስልክ ቁጥር ከ20 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      recipient_email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: { msg: "የተቀባይ ኢሜይል ትክክለኛ መሆን አለበት።" },
        },
      },
      recipient_nationalid: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የተቀባይ መለያ ቁጥር ከ50 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },

      // Property Information
      property_use: {
        type: DataTypes.ENUM(Object.values(PROPERTY_USE)),
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(PROPERTY_USE)],
            msg: "የንብረት አጠቃቀም ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      transfer_type: {
        type: DataTypes.ENUM(Object.values(TRANSFER_TYPE)),
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(TRANSFER_TYPE)],
            msg: "የስመ-ንብረት አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      sale_or_gift_sub: {
        type: DataTypes.ENUM(Object.values(SALE_OR_GIFT_SUB)),
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(SALE_OR_GIFT_SUB)],
            msg: "የንብረት ይዞታ አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      file: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: [],
        validate: {
          isValidFileArray(value) {
            if (value && !Array.isArray(value)) {
              throw new Error("File must be an array");
            }
            if (value) {
              value.forEach((file) => {
                if (file.file_path && typeof file.file_path !== "string") {
                  throw new Error("File path must be a string");
                }
              });
            }
          },
        },
      },
      inheritance_relation: {
        type: DataTypes.ENUM(Object.values(INHERITANCE_RELATION)),
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(INHERITANCE_RELATION)],
            msg: "የውርስ ግንኙነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
          },
        },
      },
      // Fee Calculation
      base_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "መሠረታዊ ዋጋ ከ0 በታች መሆን አይችልም።" },
        },
      },
      service_fee: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የአገልግሎት ክፍያ ከ0 በታች መሆን አይችልም።" },
        },
      },
      service_rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የአገልግሎት ተመን ከ0 በታች መሆን አይችልም።" },
          max: { args: [100], msg: "የአገልግሎት ተመን ከ100 በላይ መሆን አይችልም።" },
        },
      },
      tax_amount: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የታክስ መጠን ከ0 በታች መሆን አይችልም።" },
        },
      },
      tax_rate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የታክስ ተመን ከ0 በታች መሆን አይችልም።" },
          max: { args: [100], msg: "የታክስ ተመን ከ100 በላይ መሆን አይችልም።" },
        },
      },
      total_payable: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "ጠቅላላ ክፍያ ከ0 በታች መሆን አይችልም።" },
        },
      },

      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "administrative_units", key: "id" },
      },
      status: {
        type: DataTypes.ENUM(Object.values(TRANSFER_STATUS)),
        defaultValue: TRANSFER_STATUS.PENDING,
        allowNull: false,
      },

      // User References
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
    },
    {
      tableName: "ownership_transfers",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["land_record_id"] },
        { fields: ["recipient_user_id"] },
        { fields: ["administrative_unit_id"] },
        { fields: ["transfer_type"] },
        { fields: ["property_use"] },
        { fields: ["status"] },
        { fields: ["created_by"] },
        { fields: ["updated_by"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  // Return both model and constants
  return {
    OwnershipTransfer,
    SALE_OR_GIFT_SUB,
    PROPERTY_USE,
    INHERITANCE_RELATION,
    TRANSFER_TYPE,
    TRANSFER_STATUS,
  };
};
