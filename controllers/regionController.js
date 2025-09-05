const {
  createRegionService,
  getAllRegionsService,
  getRegionByIdService,
  updateRegionService,
  deleteRegionService,
} = require("../services/regionService");

const createRegion = async (req, res) => {
  try {
    const userId = req.user.id;
    const region = await createRegionService(req.body, userId);
    res.status(201).json({
      status: "success",
      data: region,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ክልል መፍጠር አልተሳካም።",
    });
  }
};

const getAllRegions = async (req, res) => {
  try {
    const regions = await getAllRegionsService();
    const numberOfRegions = regions.length;
    res.status(200).json({
      status: "success",
      numberOfRegions,
      data: regions,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ክልሎችን ማግኘት አልተሳካም።",
    });
  }
};

const getRegionById = async (req, res) => {
  try {
    const region = await getRegionByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: region,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ክልል አልተገኘም።",
    });
  }
};

const updateRegion = async (req, res) => {
  try {
    const userId =  req.user.id; 
    const region = await updateRegionService(req.params.id, req.body, userId);
    res.status(200).json({
      status: "success",
      data: region,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ክልል ማዘመን አልተሳካም።",
    });
  }
};

const deleteRegion = async (req, res) => {
  try {
    const userId = req.user.id; 
    await deleteRegionService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ክልል መሰረዝ አልተሳካም።",
    });
  }
};
module.exports = {
  createRegion,
  getAllRegions,
  getRegionById,
  updateRegion,
  deleteRegion,
};