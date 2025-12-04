// services/geoCoordinateService.js  ← REPLACE ENTIRE FILE

const proj4 = require('proj4');
const turf = require('@turf/turf');
const { GeoCoordinate, LandRecord } = require('../models');

proj4.defs('EPSG:20137', '+proj=utm +zone=37 +ellps=clrk66 +towgs84=-166,-15,204,0,0,0,0 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const createCoordinates = async ({ land_record_id, points }, transaction) => {
  // Validation
  if (!land_record_id || isNaN(land_record_id)) {
    throw new AppError('Valid land_record_id is required', 400);
  }
  if (!Array.isArray(points) || points.length < 3) {
    throw new AppError('At least 3 coordinate points are required', 400);
  }

  // Check land record exists
  const landRecord = await LandRecord.findByPk(land_record_id, { transaction });
  if (!landRecord) throw new AppError('Land record not found', 404);

  // Delete old coordinates
  await GeoCoordinate.destroy({ where: { land_record_id }, transaction });

  // Convert X/Y → Lat/Long + prepare for DB
  const coordinates = points.map((pt, i) => {
    const easting = parseFloat(pt.easting);
    const northing = parseFloat(pt.northing);

    if (isNaN(easting) || isNaN(northing)) {
      throw new AppError(`Point ${i + 1}: Invalid easting/northing values`, 400);
    }

    const [longitude, latitude] = proj4('EPSG:20137', 'EPSG:4326', [easting, northing]);

    return {
      land_record_id,
      easting,
      northing,
      latitude: Number(latitude.toFixed(8)),
      longitude: Number(longitude.toFixed(8)),
      sequence: i,
      label: pt.label?.toString().trim() || `${i + 1}`,
      description: pt.description || null,
    };
  });

  // Save to database
  const created = await GeoCoordinate.bulkCreate(coordinates, { transaction });

  // CORRECT AREA & PERIMETER USING PROJECTED COORDINATES (meters)
  const shoelaceArea = () => {
    let area = 0;
    const n = created.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += created[i].easting * created[j].northing;
      area -= created[j].easting * created[i].northing;
    }

    return Math.abs(area) / 2.0;
  };

  const calculatePerimeter = () => {
    let perimeter = 0;
    const n = created.length;

    for (let i = 0; i < n; i++) {
      const current = created[i];
      const next = created[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      perimeter += Math.hypot(dx, dy); // Math.hypot = sqrt(dx² + dy²)
    }

    return perimeter;
  };

  const area = shoelaceArea();
  const perimeter = calculatePerimeter();

  // Center (average of lat/long)
  const center = {
    latitude: Number((created.reduce((sum, c) => sum + c.latitude, 0) / created.length).toFixed(8)),
    longitude: Number((created.reduce((sum, c) => sum + c.longitude, 0) / created.length).toFixed(8)),
  };

  return {
    coordinates: created,
    polygon: created.map(c => [c.latitude, c.longitude]), 
    center,
    area_m2: Number(area.toFixed(2)),
    perimeter_m: Number(perimeter.toFixed(2)),
  };
};

const getCoordinatesByLandRecord = async (land_record_id) => {

  if (!land_record_id || isNaN(land_record_id)) {
    throw new AppError('Valid land_record_id is required', 400);
  }

  const coordinates = await GeoCoordinate.findAll({
    where: { land_record_id },
    order: [['sequence', 'ASC']],
    attributes: [
      'id', 'easting', 'northing', 'latitude', 'longitude',
      'sequence', 'label', 'description', 'createdAt'
    ],
  });

  if (!coordinates || coordinates.length === 0) {
    return null;
  }

  // CORRECT AREA USING SHOELACE FORMULA (in meters)
  const shoelaceArea = () => {
    let area = 0;
    const n = coordinates.length;

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += coordinates[i].easting * coordinates[j].northing;
      area -= coordinates[j].easting * coordinates[i].northing;
    }

    return Math.abs(area) / 2.0;
  };

  // CORRECT PERIMETER USING EUCLIDEAN DISTANCE (in meters)
  const calculatePerimeter = () => {
    let perimeter = 0;
    const n = coordinates.length;

    for (let i = 0; i < n; i++) {
      const current = coordinates[i];
      const next = coordinates[(i + 1) % n];
      const dx = next.easting - current.easting;
      const dy = next.northing - current.northing;
      perimeter += Math.hypot(dx, dy);
    }

    return perimeter;
  };

  const area = shoelaceArea();
  const perimeter = calculatePerimeter();



  // Center point (average of lat/long for Leaflet)
  const center = {
    latitude: Number((coordinates.reduce((sum, c) => sum + c.latitude, 0) / coordinates.length).toFixed(8)),
    longitude: Number((coordinates.reduce((sum, c) => sum + c.longitude, 0) / coordinates.length).toFixed(8)),
  };


  return {
    coordinates,
    polygon: coordinates.map(c => [c.latitude, c.longitude]),
    center,
    area_m2: Number(area.toFixed(2)),
    perimeter_m: Number(perimeter.toFixed(2)),
  };
};

module.exports = { createCoordinates, getCoordinatesByLandRecord };