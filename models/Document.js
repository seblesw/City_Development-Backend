module.exports = (db, DataTypes) => {
  const Document = db.define(
    'Document',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'land_records',
          key: 'id',
        },
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Ownership Certificate', 'Title Deed', 'Survey Plan', 'Tax Receipt', 'Permit', 'Lease Agreement', 'Other']],
        },
      },
      is_main_document: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      file_reference: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          len: [1, 255],
        },
      },
      document_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
        unique: true,
        validate: {
          len: [1, 50],
        },
      },
      issue_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      expiry_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      verified_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['Pending', 'Verified', 'Rejected']],
        },
      },
      file_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 0,
        },
      },
      file_format: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['PDF', 'JPEG', 'PNG', 'Other']],
        },
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      tableName: 'documents',
      timestamps: true,
    }
  );

  return Document;
};