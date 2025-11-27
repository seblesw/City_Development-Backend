const DOCUMENT_TYPES = {
  TITLE_DEED: "የባለቤትነት ሰነድ",
};

module.exports = (db, DataTypes) => {
  const Document = db.define(
    "Document",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      plot_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የካርታ ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 50], msg: "የካርታ ቁጥር ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።" },
        },
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "land_records", key: "id" },
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: {
            args: [Object.values(DOCUMENT_TYPES)],
            msg: "የሰነድ አይነት ከተፈቀዱት ውስጥ መሆን አለበት።",
          },
        },
      },
      shelf_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የሰነድ ሸልፍ ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      box_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የሰነድ ሳጥን ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      reference_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የሰነድ አመላካች ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      file_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 50],
            msg: "የሰነድ ፋይል ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      numebr_of_pages: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          isInt: { msg: "የገጾች ቁጥር ትክክለኛ መሆን አለበት።" },
          min: { args: [1], msg: "የገጾች ቁጥር ከ1 በላይ መሆን አለበት።" },
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      inActived_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      inactived_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      files: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: [],
      },
      issue_date: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "መግለጫ ከ0 እስከ 500 ቁምፊዎች መሆን አለበት።" },
        },
      },
      scale: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      verified_plan_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [1, 20], msg: "የጸደቀ የ ፕላን ቁጥር ከ 20 መብለጥ አይችልም" },
        },
      },

      preparer_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [1, 100],
            msg: "የሰነድ አዘጋጅ ስም ከ1 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      verifyer_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 100],
            msg: "የሰነድ አረጋጋጭ ስም ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      approver_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 100],
            msg: "የሰነድ አጽዳቂ ስም ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      version: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false,
        validate: {
          min: 1,
        },
      },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        validate: {
          isInt: { msg: "ሰነድ የጫነው መለያ ቁጥር ትክክለኛ መሆን አለበት።" },
        },
      },
    },
    {
      tableName: "documents",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { unique: true, fields: ["plot_number", "land_record_id"] },
        { fields: ["reference_number"] },
        { fields: ["land_record_id"] },
        { fields: ["document_type"] },
      ],
    }
  );

  return { Document, DOCUMENT_TYPES };
};
