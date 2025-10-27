const PROPERTY_USE = {
  RESIDENTIAL: "መኖሪያ",
  ORGANIZATION: "ድርጅት",
  MIXED: "ቅይጥ",
};

SALE_OR_GIFT_SUB = {
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
  const OwnershipTransfer = db.define("OwnershipTransfer", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },

    // Property Information Fields
    property_use: {
      type: DataTypes.ENUM(Object.values(PROPERTY_USE)),
      allowNull: true,
    },
    transfer_type: {
      type: DataTypes.ENUM(Object.values(TRANSFER_TYPE)),
      allowNull: true,
    },
    inheritance_relation: {
      type: DataTypes.ENUM(Object.values(INHERITANCE_RELATION)),
      allowNull: true,
    },
    plot_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    parcel_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    land_area: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    land_value: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    property_value: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    property_location: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    file: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },

    // Fee Calculation Fields
    base_value: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    service_fee: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    tax_amount: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },
    total_payable: {
      type: DataTypes.DECIMAL,
      allowNull: true,
    },

    // Personal Information Fields
    //transciever
    transceiver_full_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    transceiver_phone: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    transceiver_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    transceiver_nationalid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    //reciepent
    recipient_full_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    recipient_phone: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    recipient_email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recipient_nationalid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });

  return OwnershipTransfer;
};
