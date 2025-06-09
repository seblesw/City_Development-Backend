const {
  createRegionService,
  getAllRegionsService,
  getRegionByIdService,
  updateRegionService,
  deleteRegionService,
} = require('../services/regionService');

exports.createRegion = async (req, res) => {
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

exports.getAllRegions = async (req, res) => {
  try {
    const regions = await getAllRegionsService();
    const numberOfRegions = regions.length;
    res.status(200).json({
      numberOfRegions,
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

exports.getRegionById = async (req, res) => {
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

exports.updateRegion = async (req, res) => {
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

exports.deleteRegion = async (req, res) => {
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
