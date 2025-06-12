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
      document_name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      document_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Ownership Certificate', 'Title Deed', 'Survey Plan', 'Tax Receipt', 'Permit', 'Lease Agreement', 'Other']],
        },
      },
      number_of_documnets: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
        },
      },

      file_reference: {
        type: DataTypes.STRING,
        allowNull: false,

      },
      map_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,

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
      prepared_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
    },
    {
      tableName: 'documents',
      timestamps: true,
    }
  );

  return Document;
};