const {
  createOversightOfficeService,
  getAllOversightOfficesService,
  getOversightOfficeByIdService,
  updateOversightOfficeService,
  deleteOversightOfficeService,
  getOversightOfficeStatsService,
} = require('../services/oversightOfficeService');

const createOversightOffice = async (req, res) => {
  try {
    const { name, region_id, zone_id, woreda_id } = req.body;
    const userId = req.user.id;
    // console.log("Creating oversight office with data:", { name, region_id, zone_id, woreda_id });
    // console.log("User ID:", userId);
    const office = await createOversightOfficeService({ name, region_id, zone_id, woreda_id }, userId);
    res.status(201).json({
      status: 'success',
      data: office,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ቢሮ መፍጠር አልተሳካም።',
    });
  }
};

const getAllOversightOffices = async (req, res) => {
  try {
    const { regionId } = req.query;
    const offices = await getAllOversightOfficesService(regionId);
    const numberOfOffices = offices.length;
    res.status(200).json({
      status: 'success',
      numberOfOffices,
      data: offices,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ቢሮዎችን ማግኘት አልተሳካም።',
    });
  }
};

const getOversightOfficeById = async (req, res) => {
  try {
    const office = await getOversightOfficeByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: office,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ቢሮ አልተገኘም።',
    });
  }
};

const updateOversightOffice = async (req, res) => {
  try {
    const { name, region_id, zone_id, woreda_id } = req.body;
    const userId = req.user.id;
    const office = await updateOversightOfficeService(req.params.id, { name, region_id, zone_id, woreda_id }, userId);
    res.status(200).json({
      status: 'success',
      data: office,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ቢሮ ማዘመን አልተሳካም።',
    });
  }
};

const deleteOversightOffice = async (req, res) => {
  try {
    await deleteOversightOfficeService(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ቢሮ መሰረዝ አልተሳካም።',
    });
  }
};
//get the statistics of the oversight office
const getOversightOfficeStats = async (req, res) => {
  try {
    const userOversightOfficeId = req.user.oversight_office_id;
    if (!userOversightOfficeId) {
      throw new Error('ይህ ተጠቃሚ በዚህ ቢሮ ውስጥ አይገኝም።');
    }

    const stats = await getOversightOfficeStatsService(userOversightOfficeId);
    res.status(200).json({
      status: 'success',
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'Failed to get oversight office statistics',
    });
  }
};
module.exports = {
  createOversightOffice,
  getAllOversightOffices,
  getOversightOfficeById,
  updateOversightOffice,
  deleteOversightOffice,
  getOversightOfficeStats,
};