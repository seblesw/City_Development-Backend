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
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,
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

      },
      height: {
        type: DataTypes.FLOAT,
        allowNull: true,

      },
      width: {
        type: DataTypes.FLOAT,
        allowNull: true,

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
        type: DataTypes.STRING,
        allowNull: true,

      },
      south_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,

      },
      east_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,

      },
      west_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,

      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,

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
        type: DataTypes.STRING,
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