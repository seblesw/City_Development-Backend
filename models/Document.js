const { Op } = require("sequelize");

const DOCUMENT_TYPES = {
  TITLE_DEED: "የባለቤትነት ሰነድ",
  LEASE_AGREEMENT: "የሊዝ ስምምነት",
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  TRANSFER_DOCUMENT: "የማስተላለፍ ሰነድ",
  SURVEY_PLAN: "የመሬት መለኪያ ፕላን",
  OTHER: "ሌላ",
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
        allowNull: false,
        references: { model: "land_records", key: "id" },
      },
      issue_date: {
        type: DataTypes.DATE,
        allowNull: false,
        validate: {
          isDate: { msg: "የሰነድ ቀን ትክክለኛ ቀን መሆን አለበት።" },
          notEmpty: { msg: "የሰነድ ቀን ባዶ መሆን አይችልም።" },
        },
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(DOCUMENT_TYPES)],
            msg: "የሰነድ አይነት ከተፈቀዱት እሴቶች ውስጥ መሆን አለበት።",
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
            if (value === "") throw new Error("የሰነድ ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
          },
        },
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      inactive_reason: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { 
          len: { args: [0, 200], msg: "የማስተካከያ ምክንያት ከ0 እስከ 200 ቁምፊዎች መሆን አለበት።" },
          isIn: {
            args: [["ዉል ሲቋረጥ", "ስመ ንብረት ዝውውር", "ይዞታ ሲቀላቀል", "በልማት ተነስሽ"]],
            msg: "የማስተካከያ ምክንያት መግለጫ መሆን አለበት።",
          },
        },
      },
      prepared_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
      },
      files: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        validate: {
          isValidFiles(value) {
            if (!Array.isArray(value) || value.length === 0) {
              throw new Error("ቢያንስ አንድ ፋይል መግለጥ አለበት።");
            }
            for (const file of value) {
              if (!file.file_path || typeof file.file_path !== "string") {
                throw new Error("እያንዳንዱ ፋይል ትክክለኛ የፋይል መንገድ መያዝ አለበት።");
              }
              if (file.file_name && typeof file.file_name !== "string") {
                throw new Error("የፋይል ስም ትክክለኛ ሕብረቁምፊ መሆን አለበት።");
              }
              if (!file.mime_type || !["application/pdf", "image/jpeg", "image/png"].includes(file.mime_type)) {
                throw new Error("የፋይል አይነት PDF፣ JPEG ወይም PNG መሆን አለበት።");
              }
              if (!file.file_size || typeof file.file_size !== "number" || file.file_size <= 0 || file.file_size > 10 * 1024 * 1024) {
                throw new Error("የፋዯል መጠን ከ0 ባዪት እስከ 10MB መሆን አለበት።");
              }
            }
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "መግለጫ ከ0 እስከ 500 ቁምፊዎች መሆን አለበት።" },
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
        { unique: true, fields: ["reference_number", "land_record_id"] },
        { fields: ["land_record_id"] },
        { fields: ["document_type"] },
        { fields: ["uploaded_by"] },
      ],
      hooks: {
        beforeCreate: async (document, options) => {
          // Validate uploaded_by role
          const uploader = await db.models.User.findByPk(document.uploaded_by, {
            include: [{ model: db.models.Role, as: "role" }],
            transaction: options.transaction,
          });
          if (!uploader || !["መመዝገቢ", "አስተዳደር"].includes(uploader.role?.name)) {
            throw new Error("ሰነድ መጫን የሚችሉት መመዝገቢ ወዯም አስተዳደር ብቻ ናቸው።");
          }

          // Validate land_record_id
          const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
            transaction: options.transaction,
          });
          if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");

          // Validate map_number uniqueness within land_record_id
          const existingMap = await db.models.Document.findOne({
            where: {
              map_number: document.map_number,
              land_record_id: document.land_record_id,
              deleted_at: { [Op.eq]: null },
            },
            transaction: options.transaction,
          });
          if (existingMap) throw new Error("ይህ የካርታ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");

          // Validate reference_number uniqueness within land_record_id
          if (document.reference_number) {
            const existingRef = await db.models.Document.findOne({
              where: {
                reference_number: document.reference_number,
                land_record_id: document.land_record_id,
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (existingRef) throw new Error("ይህ የሰነድ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");
          }

          // Log document creation in LandRecord.action_log
          landRecord.action_log = [
            ...(landRecord.action_log || []),
            {
              action: `DOCUMENT_UPLOADED_${document.document_type}`,
              changed_by: document.uploaded_by,
              changed_at: document.createdAt || new Date(),
              document_id: document.id,
            },
          ];
          await landRecord.save({ transaction: options.transaction });
        },
        beforeUpdate: async (document, options) => {
          // Validate uploaded_by role on update
          if (document.changed("uploaded_by")) {
            const uploader = await db.models.User.findByPk(document.uploaded_by, {
              include: [{ model: db.models.Role, as: "role" }],
              transaction: options.transaction,
            });
            if (!uploader || !["መመዝገቢ", "አስተዳደር"].includes(uploader.role?.name)) {
              throw new Error("ሰነድ መጫን የሚችሉት መመዝገቢ ወዯም አስተዳደር ብቻ ናቸው።");
            }
          }

          // Validate land_record_id on update
          if (document.changed("land_record_id")) {
            const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
              transaction: options.transaction,
            });
            if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
          }

          // Validate map_number uniqueness within land_record_id on update
          if (document.changed("map_number") || document.changed("land_record_id")) {
            const existingMap = await db.models.Document.findOne({
              where: {
                map_number: document.map_number,
                land_record_id: document.land_record_id,
                id: { [Op.ne]: document.id },
                deleted_at: { [Op.eq]: null },
              },
              transaction: options.transaction,
            });
            if (existingMap) throw new Error("ይህ የካርታ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");
          }

          // Validate reference_number uniqueness within land_record_id on update
          if (document.changed("reference_number") || document.changed("land_record_id")) {
            if (document.reference_number) {
              const existingRef = await db.models.Document.findOne({
                where: {
                  reference_number: document.reference_number,
                  land_record_id: document.land_record_id,
                  id: { [Op.ne]: document.id },
                  deletedAt: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existingRef) throw new Error("ይህ የሰነድ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");
            }
          }

          // Log document update in LandRecord.action_log
          const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
            transaction: options.transaction,
          });
          if (landRecord) {
            landRecord.action_log = [
              ...(landRecord.action_log || []),
              {
                action: `DOCUMENT_UPDATED_${document.document_type}`,
                changed_by: document.uploaded_by,
                changed_at: document.updatedAt || new Date(),
                document_id: document.id,
              },
            ];
            await landRecord.save({ transaction: options.transaction });
          }
        },
      },
      validate: {
        async validLandRecord() {
          const landRecord = await db.models.LandRecord.findByPk(this.land_record_id);
          if (!landRecord) throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
        },
      },
    }
  );

  return Document;
};