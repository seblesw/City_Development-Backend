const {
  createZoneService,
  getAllZonesService,
  getZoneByIdService,
  updateZoneService,
  deleteZoneService,
} = require('../services/ZoneService');

exports.createZone = async (req, res) => {
  try {
    const { name, region_id } = req.body;
    const userId = req.user.id;
    const zone = await createZoneService({ name, region_id }, userId);
    res.status(201).json({
      status: 'success',
      data: zone,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ዞን መፍጠር አልተሳካም።',
    });
  }
};

exports.getAllZones = async (req, res) => {
  try {
    const { regionId } = req.query;
    const zones = await getAllZonesService(regionId);
    const numberOfZones = zones.length;
    res.status(200).json({
      status: 'success',
      numberOfZones,
      data: zones,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ዞኖችን ማግኘት አልተሳካም።',
    });
  }
};

exports.getZoneById = async (req, res) => {
  try {
    const zone = await getZoneByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: zone,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ዞን አልተገኘም።',
    });
  }
};

exports.updateZone = async (req, res) => {
  try {
    const { name, region_id } = req.body;
    const userId = req.user.id;
    const zone = await updateZoneService(req.params.id, { name, region_id }, userId);
    res.status(200).json({
      status: 'success',
      data: zone,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ዞን ማዘመን አልተሳካም።',
    });
  }
};

exports.deleteZone = async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteZoneService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ዞን መሰረዝ አልተሳካም።',
    });
  }
};