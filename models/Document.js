// models/Document.js
const { Op } = require("sequelize");

const DOCUMENT_TYPES = {
  OWNERSHIP_CERTIFICATE: "የባለቤትነት ሰርተፍኬት",
  LEASE_AGREEMENT: "የኪራይ ስምምነት",
  COURT_ORDER: "የፍርድ ቤት ትእዛዝ",
  PAYMENT_RECEIPT: "የክፍያ ደረሰኝ",
  OTHER: "ሌላ"
};

const DOCUMENT_STATUSES = {
  PENDING: "በመጠባበቅ ላይ",
  VERIFIED: "ተረጋግጧል",
  REJECTED: "ውድቅ ተደርጓል"
};

module.exports = (db, DataTypes) => {
  const Document = db.define(
    "Document",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // Nullable for initial creation
        references: { model: "applications", key: "id" }
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(DOCUMENT_TYPES)],
            msg: "የሰነድ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      document_status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: DOCUMENT_STATUSES.PENDING,
        validate: {
          isIn: {
            args: [Object.values(DOCUMENT_STATUSES)],
            msg: "የሰነድ ሁኔታ ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።"
          }
        }
      },
      file_path: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: { msg: "የሰነድ ፋይል መንገድ ባዶ መሆን አይችልም።" },
          len: { args: [1, 255], msg: "የፋይል መንገድ ከ255 ቁምፊዎች መብለጥ አይችልም።" },
          is: {
            args: /\.(pdf|jpg|jpeg|png|doc|docx)$/i,
            msg: "የፋይል ቅጥያ ትክክለኛ መሆን አለበት (pdf, jpg, jpeg, png, doc, docx)።"
          }
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: "መግለጫ ከ500 ቁምፊዎች መብለጥ አይችልም።" }
        }
      }
    },
    {
      tableName: "documents",
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ["application_id"], where: { application_id: { [Op.ne]: null } } },
        { fields: ["document_type"] },
        { fields: ["document_status"] },
        { unique: true, fields: ["file_path", "application_id"] }
      ],
      hooks: {
        beforeCreate: async (document, options) => {
          // Validate unique file_path within application_id
          if (document.application_id) {
            const existing = await db.models.Document.findOne({
              where: {
                file_path: document.file_path,
                application_id: document.application_id
              },
              transaction: options.transaction
            });
            if (existing) throw new Error("ይህ የፋይል መንገድ በዚህ መጠየቂያ ውስጥ አስቀድመው ጥቅም ላይ ውሏል።");
          }
        },
        beforeUpdate: async (document, options) => {
          // Prevent updates if application is APPROVED
          if (document.application_id) {
            const application = await db.models.Application.findByPk(document.application_id, {
              transaction: options.transaction
            });
            if (application?.status === "ጸድቋል") {
              throw new Error("የጸድቋል መጠየቂያ ጋር የተገናኘ ሰነድ መቀየር አይችልም።");
            }
          }
          // Validate unique file_path within application_id on update
          if (document.changed("file_path") || document.changed("application_id")) {
            const existing = await db.models.Document.findOne({
              where: {
                file_path: document.file_path,
                application_id: document.application_id,
                id: { [Op.ne]: document.id }
              },
              transaction: options.transaction
            });
            if (existing) throw new Error("ይህ የፋይል መንገድ በዚህ መጠየቂያ ውስጥ አስቀድመው ጥቅም ላይ ውሏል።");
          }
          // Validate document_status transitions
          const validTransitions = {
            [DOCUMENT_STATUSES.PENDING]: [DOCUMENT_STATUSES.VERIFIED, DOCUMENT_STATUSES.REJECTED],
            [DOCUMENT_STATUSES.VERIFIED]: [],
            [DOCUMENT_STATUSES.REJECTED]: [DOCUMENT_STATUSES.PENDING]
          };
          if (document.changed("document_status")) {
            const previousStatus = document.previous("document_status");
            if (!validTransitions[previousStatus]?.includes(document.document_status)) {
              throw new Error(`ከ${previousStatus} ወደ ${document.document_status} መሸጋገር አይችልም።`);
            }
          }
        }
      }
    }
  );

  Document.associate = (models) => {
    Document.belongsTo(models.Application, { as: "application", foreignKey: "application_id" });
  };

  return Document;
};