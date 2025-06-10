module.exports = (db, DataTypes) => {
  const LandRecord = db.define(
    'LandRecord',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      land_id: {
        type: DataTypes.STRING(50),
        unique: true,
        allowNull: false,
        validate: {
          len: [1, 50],
        },
      },
      owner_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'administrative_units',
          key: 'id',
        },
      },
      area: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      height: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: 0,
        },
      },
      width: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
          min: 0,
        },
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed', 'Other']],
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Lease', 'Transfer', 'Sale', 'Inheritance', 'Gift']],
        },
      },
      north_neighbor: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      south_neighbor: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      east_neighbor: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      west_neighbor: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: {
          len: [1, 255],
        },
      },
      coordinates: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      registration_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Pending', 'Under Review', 'Approved', 'Rejected']],
        },
      },
      registered_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      approved_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      land_value: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      zoning_code: {
        type: DataTypes.STRING(50),
        allowNull: true,

      },
    },
    {
      tableName: 'land_records',
      timestamps: true,
    }
  );

  return LandRecord;
};