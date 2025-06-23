const {
  createAdministrativeUnitService,
  getAllAdministrativeUnitsService,
  getAdministrativeUnitByIdService,
  updateAdministrativeUnitService,
  deleteAdministrativeUnitService,
} = require('../services/administrativeUnitService');

exports.createAdministrativeUnit = async (req, res) => {
  try {
    const { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations } = req.body;
    const userId = req.user.id;
    const unit = await createAdministrativeUnitService(
      { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations },
      userId
    );
    res.status(201).json({
      status: 'success',
      data: unit,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'አስተዳደራዊ ክፍል መፍጠር አልተሳካም።',
    });
  }
};

exports.getAllAdministrativeUnits = async (req, res) => {
  try {
    const { regionId, oversightOfficeId } = req.query;
    const units = await getAllAdministrativeUnitsService(regionId, oversightOfficeId);
    const numberOfUnits = units.length;
    res.status(200).json({
      status: 'success',
      numberOfUnits,
      data: units,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'አስተዳደራዊ ክፍሎችን ማግኘቤት አልተሳካም።',
    });
  }
};

exports.getAdministrativeUnitById = async (req, res) => {
  try {
    const unit = await getAdministrativeUnitByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: unit,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'አስተዳደራዊ ክፍል አልተገኘም።',
    });
  }
};

exports.updateAdministrativeUnit = async (req, res) => {
  try {
    const { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations } = req.body;
    const userId = req.user.id;
    const unit = await updateAdministrativeUnitService(
      req.params.id,
      { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations },
      userId
    );
    res.status(200).json({
      status: 'success',
      data: unit,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'አስተዳደራዊ ክፍል ማዘመን አልተሳካም።',
    });
  }
};

exports.deleteAdministrativeUnit = async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteAdministrativeUnitService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'አስተዳደራዊ ክፍል መሰረዝ አልተሳካም።',
    });
  }
};