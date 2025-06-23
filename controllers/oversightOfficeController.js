const {
  createOversightOfficeService,
  getAllOversightOfficesService,
  getOversightOfficeByIdService,
  updateOversightOfficeService,
  deleteOversightOfficeService,
} = require('../services/oversightOfficeService');

exports.createOversightOffice = async (req, res) => {
  try {
    const { name, region_id, zone_id, woreda_id } = req.body;
    const userId = req.user.id;
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

exports.getAllOversightOffices = async (req, res) => {
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

exports.getOversightOfficeById = async (req, res) => {
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

exports.updateOversightOffice = async (req, res) => {
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

exports.deleteOversightOffice = async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteOversightOfficeService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ቢሮ መሰረዝ አልተሳካም።',
    });
  }
};