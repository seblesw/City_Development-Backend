const {
  createZoneService,
  getAllZonesService,
  getZoneByIdService,
  updateZoneService,
  deleteZoneService,
} = require("../services/zoneService");

const createZone = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const zone = await createZoneService(req.body, userId);
    res.status(201).json({
      status: "success",
      data: zone,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ዞን መፍጠር አልተሳካም።",
    });
  }
};

const getAllZones = async (req, res) => {
  try {
    const zones = await getAllZonesService();
    const numberOfZones = zones.length;
    res.status(200).json({
      status: "success",
      numberOfZones,
      data: zones,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ዞኖችን ማግኘት አልተሳካም።",
    });
  }
};

const getZoneById = async (req, res) => {
  try {
    const zone = await getZoneByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: zone,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ዞን አልተገኘም።",
    });
  }
};

const updateZone = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const zone = await updateZoneService(req.params.id, req.body, userId);
    res.status(200).json({
      status: "success",
      data: zone,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ዞን ማዘመን አልተሳካም።",
    });
  }
};

const deleteZone = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    await deleteZoneService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ዞን መሰረዝ አልተሳካም።",
    });
  }

};
module.exports = {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
};