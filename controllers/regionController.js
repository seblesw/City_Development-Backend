const {
  createRegionService,
  getAllRegionsService,
  getRegionByIdService,
  updateRegionService,
  deleteRegionService,
} = require('../services/regionService');

const createRegion = async (req, res) => {
  try {
    const region = await createRegionService(req.body);
    res.status(201).json({
      status: 'success',
      data: region,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

const getAllRegions = async (req, res) => {
  try {
    const regions = await getAllRegionsService();
    res.status(200).json({
      status: 'success',
      data: regions,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

const getRegionById = async (req, res) => {
  try {
    const region = await getRegionByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: region,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message,
    });
  }
};

const updateRegion = async (req, res) => {
  try {
    const region = await updateRegionService(req.params.id, req.body);
    res.status(200).json({
      status: 'success',
      data: region,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

const deleteRegion = async (req, res) => {
  try {
    const result = await deleteRegionService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message,
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