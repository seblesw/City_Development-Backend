// routes/geoCoordinates.js

const express = require('express');
const router = express.Router();
const {
  createGeoCoordinates,
  getGeoCoordinatesByLandRecord,
} = require('../controllers/geoCoordinateController');

// GET    → Get full parcel data (polygon, area, perimeter, center)
// URL:   GET /api/land-records/123/coordinates
router.get(
  '/:land_record_id/coordinates',
  getGeoCoordinatesByLandRecord
);

// POST   → Save or replace coordinates for a land record
// URL:   POST /api/land-records/123/coordinates
router.post(
  '/:land_record_id',
  createGeoCoordinates
);


module.exports = router;