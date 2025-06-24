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
          unique: true,
          allowNull: false,
          validate: {
            len: { args: [0, 50], msg: "የካርታ ቁጥር ከ0 እስከ 50 ቁምፊዎች መሆን አለበት።" },
            is: {
              args: /^[A-Za-z0-9-]+$/,
              msg: "የካርታ ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።",
            },
            notEmptyString(value) {
              if (value === "") throw new Error("የካርታ ቁጥር ባዶ መሆን አይችልም። ካልተገለጸ null ይጠቀሙ።");
            },
          },
        },
        land_record_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "land_records", key: "id" },
        },
        application_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "applications", key: "id" },
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
        issue_date: {
          type: DataTypes.DATE,
          allowNull: true,
          validate: {
            isDate: { msg: "ትክክለኛ ቀን ያስገቡ።" },
            notFutureDate(value) {
              if (value) {
                const today = new Date();
                if (new Date(value) > today) {
                  throw new Error("የሰነድ ቀን ወደፊት መሆን አዯችልም።");
                }
              }
            },
          },
        },
        files: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: [],
          validate: {
            isValidFiles(value) {
              if (!Array.isArray(value)) {
                throw new Error("ፋይሎች ዝርዝር መሆን አለባቸው።");
              }
              for (const file of value) {
                if (!file.file_path || typeof file.file_path !== "string") {
                  throw new Error("እያንዳንዱ ፋይል ትክክለኛ የፋይል መንገድ መያዝ አለበት።");
                }
                if (file.file_name && typeof file.file_name !== "string") {
                  throw new Error("የፋይል ስም ትክክለኛ ሕብረቁምፊ መሆን አለበት።");
                }
                if (file.mime_type && !["application/pdf", "image/jpeg", "image/png"].includes(file.mime_type)) {
                  throw new Error("የፋይል አይነት PDF፣ JPEG ወይም PNG መሆን አለበት።");
                }
              }
            },
          },
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          validate: {
            len: { args: [0, 500], msg: "መግለጫ ከ0 እስከ 500 ቁምፊዎች መሆን አለበቤ።" },
          },
        },
      },
      {
        tableName: "documents",
        timestamps: true,
        paranoid: true,
        freezeTableName: true,
        indexes: [
          { fields: ["land_record_id"] },
          { fields: ["application_id"] },
          { fields: ["document_type"] },
          { unique: true, fields: ["reference_number", "land_record_id"], },
        ],
        hooks: {
          beforeCreate: async (document, options) => {
            // Validate land_record_id
            const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
              transaction: options.transaction,
            });
            if (!landRecord) throw new Error("ትክክለኛ የመሬቤ መዝግቤ ይምረጡ።");

            // Validate application_id
            const application = await db.models.Application.findByPk(document.application_id, {
              transaction: options.transaction,
            });
            if (!application) throw new Error("ትክክለኛ መቤግበሪያ ይምረጡ።");
            if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
              throw new Error("የሰነድ መቤግበሪያ አስቤደደራዖ ክፍሖ ከመሬቤ መዝግቤ ጋር መዛመዖ አለቤቤ።");
            }
            if (application.user_id !== landRecord.user_id) {
              throw new Error("የሰነድ መቤግበሪያ ቤጠቃሚ ከመሬቤ መዝግቤ ቤጠቃሚ ጋር መዛመዖ አለቤቤ።");
            }

            // Validate administrative_unit_id consistency
            const adminUnit = await db.models.AdministrativeUnit.findByPk(landRecord.administrative_unit_id, {
              transaction: options.transaction,
            });
            if (!adminUnit) throw new Error("ትክክለኛ አስቤደደራዖ ክፍሖ ይምረጡ።");

            // Validate reference_number uniqueness within land_record_id
            if (document.reference_number) {
              const existing = await db.models.Document.findOne({
                where: {
                  reference_number: document.reference_number,
                  land_record_id: document.land_record_id,
                  deleted_at: { [Op.eq]: null },
                },
                transaction: options.transaction,
              });
              if (existing) throw new Error("ዖህ የሰነደ ቁጤር ለዖህ መሬቤ መዝግቤ ተመዖግቤዖል።");
            }
          },
          beforeUpdate: async (document, options) => {
            // Validate land_record_id on update
            if (document.changed("land_record_id")) {
              const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
                transaction: options.transaction,
              });
              if (!landRecord) throw new Error("ትክክለኛ የመሬቤ መዝግቤ ይምረጡ።");
            }

            // Validate application_id alignment
            if (document.changed("application_id") || document.changed("land_record_id")) {
              const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
                transaction: options.transaction,
              });
              const application = await db.models.Application.findByPk(document.application_id, {
                transaction: options.transaction,
              });
              if (!application) throw new Error("ትክክለኛ መቤግበሪያ ይምረጡ።");
              if (application.administrative_unit_id !== landRecord.administrative_unit_id) {
                throw new Error("የሰነደ መቤግበሪያ አስቤደደራዖ ክፍሖ ከመሬቤ መዝግቤ ጋር መዛመዖ አለቤቤ።");
              }
              if (application.user_id !== landRecord.user_id) {
                throw new Error("የሰነደ መቤግበሪያ ቤጠቃሚ ከመሬቤ መዝግቤ ቤጠቃሚ ጋር መዛመዖ አለቤቤ።");
              }
            }

            // Validate reference_number uniqueness on update
            if (document.changed("reference_number") || document.changed("land_record_id")) {
              if (document.reference_number) {
                const existing = await db.models.Document.findOne({
                  where: {
                    reference_number: document.reference_number,
                    land_record_id: document.land_record_id,
                    id: { [Op.ne]: document.id },
                    deleted_at: { [Op.eq]: null },
                  },
                  transaction: options.transaction,
                });
                if (existing) throw new Error("ዖህ የቖነዖ ቁጤሖ ለዖህ መሬቤ መዖግቤ ተመዖግቤዖል።");
              }
            }
          },
        },
      }
    );

    return Document;
  
};