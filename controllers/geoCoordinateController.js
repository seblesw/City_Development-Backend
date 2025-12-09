// controllers/geoCoordinateController.js

const GeoCoordinateService = require('../services/geoCoordinateService');

const createGeoCoordinates = async (req, res) => {
  try {
    const { land_record_id } = req.params;
    const { points } = req.body;

    const result = await GeoCoordinateService.createCoordinates({
      land_record_id: parseInt(land_record_id),
      points,
    });

    return res.status(201).json({
      success: true,
      message: 'Parcel coordinates saved and converted successfully',
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || 'Failed to save coordinates',
    });
  }
};

const getGeoCoordinatesByLandRecord = async (req, res) => {
  try {
    const { land_record_id } = req.params;

    const result = await GeoCoordinateService.getCoordinatesByLandRecord(
      parseInt(land_record_id)
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'No coordinates found for this land record',
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
};

module.exports = {
  createGeoCoordinates,
  getGeoCoordinatesByLandRecord,
};