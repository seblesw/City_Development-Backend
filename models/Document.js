const DOCUMENT_TYPES = {
  TITLE_DEED: "የባለቤትነት ሰነድ",
  LEASE_AGREEMENT: "የሊዝ ስምምነት",
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER_DOCUMENT: "የማስተላለፍ ሰነድ",
  SURVEY_PLAN: "የመሬት መለኪያ ፕላን",
  RECIEPT: "የክፍያ ደረሰኝ",
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
      map_number: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የካርታ ቁጥር ባዶ መሆን አይችልም።" },
          len: { args: [1, 50], msg: "የካርታ ቁጥር ከ1 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የካርታ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
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
      reference_number: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 50], msg: "የሰነድ ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።" },
          is: {
            args: /^[A-Za-z0-9-]+$/,
            msg: "የሰነድ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የሰነድ ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      inActived_reason: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      files: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidFiles(value) {
            if (!Array.isArray(value) || value.length === 0) {
              throw new Error("ቢያንስ አንዴ ፋይል መግለጥ አለበት።");
            }
            for (const file of value) {
              if (!file.file_path || typeof file.file_path !== "string") {
                throw new Error("እያንዳንዱ ፋይል ትክክለኛ የፋይል መንገዴ መያዝ አለበት።");
              }
              if (file.file_name && typeof file.file_name !== "string") {
                throw new Error("የፋይል ስም ትክክለኛ ሕብረቁምፊ መሆን አለበት።");
              }
              if (
                !file.mime_type ||
                !["application/pdf", "image/jpeg", "image/png"].includes(
                  file.mime_type
                )
              ) {
                throw new Error("የፋይል አይነት PDF፣ JPEG ወይም PNG መሆን አለበት።");
              }
              if (
                !file.file_size ||
                typeof file.file_size !== "number" ||
                file.file_size <= 0 ||
                file.file_size > 50 * 1024 * 1024
              ) {
                throw new Error("የፋይል መጠን ከ0 ባይት እስከ 50MB መሆን አለበት።");
              }
            }
          },
        },
      },
      issue_date: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "መግለጫ ከ0 እስከ 500 ቁምፊዎች መሆን አለበት።" },
        },
      },
      is_draft: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
        validate: {
          isBoolean(value) {
            if (typeof value !== "boolean") {
              throw new Error("is_draft የተለያዩ እሴቶች መሆን አለበት (true ወይም false)።");
            }
          },
        },
      },
      preparer_name: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የሰነዴ አዘጋጅ ስም ባዶ መሆን አይችልም።" },
          len: {
            args: [1, 100],
            msg: "የሰነዴ አዘጋጅ ስም ከ1 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
        },
      },
      approver_name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: {
            args: [0, 100],
            msg: "የሰነዴ አጽዳቂ ስም ከ0 እስከ 100 ቁምፊዎች መሆን አለበት።",
          },
          notEmptyString(value) {
            if (value === "")
              throw new Error("የሰነዴ አጽዳቂ ስም ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
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
        { unique: true, fields: ["map_number", "land_record_id"] },
        { fields: ["reference_number", "land_record_id"] },
        { fields: ["land_record_id"] },
        { fields: ["document_type"] },
      ],
    }
  );

  return {Document, DOCUMENT_TYPES};
};
