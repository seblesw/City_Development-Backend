const DOCUMENT_TYPES = {
  OWNERSHIP_CERTIFICATE: 'የባለቤትነት ሰርተፍኬት',
  LEASE_AGREEMENT: 'የኪራይ ስምምነት',
  COURT_ORDER: 'የፍርድ ቤት ትእዛዝ',
  PAYMENT_RECEIPT: 'የክፍያ ደረሰኝ',
  OTHER: 'ሌላ'
};

module.exports = (db, DataTypes) => {
  const Document = db.define(
    'Document',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      application_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'applications', key: 'id' }
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(DOCUMENT_TYPES)],
            msg: 'የሰነድ አይነት ከተፈቀዱት እሴቶች ውስጥ አንዱ መሆን አለበት።'
          }
        }
      },
      file_path: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'የሰነድ ፋይል መንገድ ባዶ መሆን አይቻልም።' },
          len: { args: [1, 255], msg: 'የፋይል መንገድ ከ255 ቁምፊዎች መብለጥ አይቻልም።' },
          is: {
            args: /\.(pdf|jpg|jpeg|png)$/i,
            msg: 'የፋይል ቅጥያ ትክክለኛ መሆን አለበት (pdf, jpg, jpeg, png)።'
          }
        }
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [0, 500], msg: 'መግለጫ ከ500 ቁምፊዎች መብለጥ አይቻልም።' }
        }
      }
    },
    {
      tableName: 'documents',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['application_id'] },
        { fields: ['document_type'] },
        { unique: true, fields: ['file_path'] }
      ],
      hooks: {
        beforeCreate: async (document, options) => {
          // Validate application_id
          const application = await db.models.Application.findByPk(document.application_id, {
            transaction: options.transaction
          });
          if (!application) throw new Error('መጠየቂያ አልተገኘም።');
          if (!['ረቂቅ', 'ቀርቧል'].includes(application.status)) {
            throw new Error('ሰነዶች በረቂቅ ወይም ቀርቧል ሁኔታ ላይ ብቻ ሊፈጠሩ ይችላሉ።');
          }
        },
        beforeUpdate: async (document, options) => {
          // Prevent updates if application is APPROVED
          const application = await db.models.Application.findByPk(document.application_id, {
            transaction: options.transaction
          });
          if (application.status === 'ጸድቋል') {
            throw new Error('የጸድቋል መጠየቂያ ጋር የተገናኘ ሰነድ መቀየር አይቻልም።');
          }
        }
      }
    }
  );

  return Document;
};