
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
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_records', key: 'id' }
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
        validate: {
          notEmpty: { msg: 'የሰነድ ፋይል መንገድ ባዶ መሆን አዯችልም።' },
          len: { args: [1, 255], msg: 'የፋይል መንገድ ከ255 ቁምፊዎች መብለጥ አዯችልም።' },
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
          len: { args: [0, 500], msg: 'መግለጫ ከ500 ቁምፊዎች መብለጥ አዯችልም።' }
        }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      }
    },
    {
      tableName: 'documents',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['application_id'] },
        { fields: ['land_record_id'] },
        { fields: ['document_type'] }
      ],
      hooks: {
        beforeCreate: async (document, options) => {
          // Ensure created_by user's administrative_unit_id matches land_record's
          const landRecord = await db.models.LandRecord.findByPk(document.land_record_id, {
            transaction: options.transaction
          });
          if (!landRecord) throw new Error('የመሬት መዝገብ አልተገኘም።');
          const user = await db.models.User.findByPk(document.created_by, {
            transaction: options.transaction
          });
          if (!user) throw new Error('ተጠቃሚ አልተገኘም።');
          if (user.administrative_unit_id !== landRecord.administrative_unit_id) {
            throw new Error('የሰነድ መመዝገቢው አስተዳደራዊ ክፍል ከመሬት መዝገብ ጋር መመሳሰል አለበት።');
          }
          // Ensure application_id matches land_record's application_id
          if (landRecord.application_id !== document.application_id) {
            throw new Error('የሰነድ መጠየቂያ ከመሬት መዝገብ መጠየቂያ ጋር መመሳሰል አለበት።');
          }
          // Validate document_type based on land_record's ownership_type
          if (
            landRecord.ownership_type === 'የፍርድ ቤት ትእዛዝ' &&
            document.document_type !== DOCUMENT_TYPES.COURT_ORDER
          ) {
            throw new Error('የፍርድ ቤት ትእዛዝ ባለቤትነት የፍርድ ቤት ትእዛዝ ሰነድ ይፈልጋል።');
          }
        }
      }
    }
  );

  return Document;
};