// models/LandRecord.js
const { validate } = require("uuid");

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
      parcel_number: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false,

      },
      land_level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
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
          isFloat: true,
          min: 0,
        },
      },
      land_use: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Residential', 'Mixed', 'Commercial', 'Administrative', 'Services', 'Manufacturing and Storage', 'Roads and Transportation', 'Urban Agriculture', 'Forestry', 'Entertainment and Playground', 'Other']],
        },
      },
      ownership_type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Court Order', 'Transfer of Title', 'Leasehold', 'Leasehold-Assignment', 'Pre-Existing-Undocumented', 'Displacement']],
        },
      },
      north_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      south_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      east_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      west_neighbor: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 100],
        },
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: [1, 255],
        },
      },
      coordinates: {
        type: DataTypes.JSONB,
        allowNull: true,
        validate: {
          isValidCoordinates(value) {
            if (value && !(Array.isArray(value.coordinates) && value.type === 'Point')) {
              throw new Error('Coordinates must be a GeoJSON Point');
            }
          },
        },
      },
      registration_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: [['Draft', 'Pending', 'Under Review', 'Approved', 'Rejected', 'Disputed']],
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
      building_permit_status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['Not Applied', 'Applied', 'Approved', 'Rejected']],
        },
      },
      environmental_zone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dispute_status: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['None', 'Pending', 'In Court', 'Resolved']],
        },
      },
      dispute_details: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'land_records',
      timestamps: true,
      indexes: [
        { fields: ['owner_id'] },
        { fields: ['administrative_unit_id'] },
      ],
    }
  );

  return LandRecord;
};