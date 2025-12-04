// models/GeoCoordinate.js
const proj4 = require('proj4');

// Define projections (Adindan UTM Zone 37N → WGS84)
proj4.defs('EPSG:20137', '+proj=utm +zone=37 +ellps=clrk66 +towgs84=-166,-15,204,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

module.exports = (db, DataTypes) => {
  const GeoCoordinate = db.define(
    'GeoCoordinate',
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },

      // Now linked to land_record, not document
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'land_records',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },

      // Official X/Y from title deed (never change these!)
      easting: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        comment: 'X (Easting) in Adindan UTM Zone 37N',
      },
      northing: {
        type: DataTypes.DOUBLE,
        allowNull: false,
        comment: 'Y (Northing) in Adindan UTM Zone 37N',
      },

      // Auto-generated for Leaflet
      latitude: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },
      longitude: {
        type: DataTypes.DOUBLE,
        allowNull: false,
      },

      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 0 },
      },

      label: {
        type: DataTypes.STRING(10),
        allowNull: true,
        comment: 'e.g. 1, 2, 3 or A, B, C',
      },

      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'geo_coordinates',
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['land_record_id'] },
        { unique: true, fields: ['land_record_id', 'sequence'] },
      ],
      hooks: {
        beforeCreate: convertXYtoLatLng,
        beforeUpdate: convertXYtoLatLng,
        beforeBulkCreate: (coords) => coords.forEach(convertXYtoLatLng),
      },
    },

  );

  // Auto convert X/Y → Lat/Long
  function convertXYtoLatLng(coord) {
    if (coord.easting != null && coord.northing != null) {
      const [lng, lat] = proj4('EPSG:20137', 'EPSG:4326', [
        parseFloat(coord.easting),
        parseFloat(coord.northing),
      ]);
      coord.longitude = Number(lng.toFixed(8));
      coord.latitude = Number(lat.toFixed(8));
    }
  }

  return GeoCoordinate;
};