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
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'land_records', key: 'id' }
      },
      map_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
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
          notEmpty: {
            msg: 'የሰነድ ፋይል መንገድ ባዶ መሆን አይችልም።'
          }
        }
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true
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
      },

    },
    {
      tableName: 'documents',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['land_record_id'] },
        { fields: ['document_type'] },
        { fields: ['map_number'], unique: true, where: { map_number: { [db.Sequelize.Op.ne]: null } } }
      ]
    }
  );

  return Document;
};