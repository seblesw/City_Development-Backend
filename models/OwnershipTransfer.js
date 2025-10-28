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
  SALE_OR_GIFT: "በሽያጭ ወይም በስጦታ ስመ-ንብረት ዝውውር",
  BANK_FORECLOSURE: "በባንክ ሐራጅ የሚሸጥ ቤት እና ይዞታ ስመ-ንብረት ዝውውር",
  COURT_DECISION: "በፍርድ ዉሳኔ የሚተላለፍ ቤት እና ይዞታ ስመ-ንብረት ዝውውር",
  CONDOMINIUM: "የጋራ ህንጻ ኮንዶሚኒየም ቤት ስመ-ንብረት ዝውውር",
  RESIDENTIAL_ASSOCIATION: "የመኖሪያ ቤት ህብረት ስራ ማህበር ቤት እና ይዞታ ስመ-ንብረት ዝውውር",
  INHERITANCE: "በውርስ የተገኘ ቤት እና ይዞታ ስመ-ንብረት ዝውውር",
  REALSTATE_HOUSE: "የሪልስቴት ቤት ስመ-ንብረት ዝውውር",
  TRADE_ORGANIZATION: "የንግድ ማህበር አደረጃጀት ስመ-ንብረት ዝውውር",
};

const INHERITANCE_RELATION = {
  CHILD: "ከልጅ ወደ ወላጅ",
  PARENT: "ከወላጅ ወደ ልጅ",
  OTHER: "ሌላ",
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
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(TRANSFER_TYPE)],
            msg: "የስመ-ንብረት አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
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
      plot_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የፕሎት ቁጥር ከ50 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      parcel_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የፓርሴል ቁጥር ከ50 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      land_area: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የመሬት ስፋት ከ0 በታች መሆን አይችልም።" },
        },
      },
      land_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የመሬት ዋጋ ከ0 በታች መሆን አይችልም።" },
        },
      },
      building_value: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: "የህንፃ ዋጋ ከ0 በታች መሆን አይችልም።" },
        },
      },
      property_location: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "የንብረት አድራሻ ከ500 ቁምፊዎች መብለጥ አይችልም።" },
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

      // Personal Information - Transceiver
      transceiver_full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የተጋራቢ ሙሉ ስም ባዶ መሆን አይችልም።" },
          len: { args: [1, 100], msg: "የተጋራቢ ስም ከ100 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      transceiver_phone: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የተጋራቢ ስልክ ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 20], msg: "የተጋራቢ ስልክ ቁጥር ከ20 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      transceiver_email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: { msg: "የተጋራቢ ኢሜይል ትክክለኛ መሆን አለበት።" },
        },
      },
      transceiver_nationalid: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የተጋራቢ መለያ ቁጥር ከ50 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },

      // Personal Information - Recipient
      recipient_full_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የተቀባይ ሙሉ ስም ባዶ መሆን አይችልም።" },
          len: { args: [1, 100], msg: "የተቀባይ ስም ከ100 ቁምፊዎች መብለጥ አይችልም።" },
        },
      },
      recipient_phone: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የተቀባይ ስልክ ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 20], msg: "የተቀባይ ስልክ ቁጥር ከ20 ቁምፊዎች መብለጥ አይችልም።" },
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

      // Administrative Unit Reference
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      // User References
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },

    },
    {
      tableName: "ownership_transfers",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["administrative_unit_id"] },
        { fields: ["transfer_type"] },
        { fields: ["property_use"] },
        { fields: ["created_by"] },
        { fields: ["updated_by"] },
        { fields: ["createdAt"] },
      ],
    }
  );

  // Return both model and constants as object
  return {
    OwnershipTransfer,
    SALE_OR_GIFT_SUB,
    PROPERTY_USE,
    INHERITANCE_RELATION,
    TRANSFER_TYPE,
  };
};