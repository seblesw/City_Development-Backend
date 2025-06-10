const {
  createAdministrativeUnitService,
  getAllAdministrativeUnitsService,
  getAdministrativeUnitByIdService,
  updateAdministrativeUnitService,
  deleteAdministrativeUnitService,
} = require('../services/administrativeUnitService');

exports.createAdministrativeUnit = async (req, res) => {
  try {
    const unit = await createAdministrativeUnitService(req.body);
    return res.status(201).json({
      status: 'success',
      message: 'Administrative unit created successfully',
      data: unit,
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.getAllAdministrativeUnits = async (req, res) => {
  try {
    const units = await getAllAdministrativeUnitsService();
    return res.status(200).json({
      status: 'success',
      message: 'Administrative units retrieved successfully',
      data: units,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.getAdministrativeUnitById = async (req, res) => {
  try {
    const unit = await getAdministrativeUnitByIdService(req.params.id);
    return res.status(200).json({
      status: 'success',
      message: 'Administrative unit retrieved successfully',
      data: unit,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.updateAdministrativeUnit = async (req, res) => {
  try {
    const unit = await updateAdministrativeUnitService(req.params.id, req.body);
    return res.status(200).json({
      status: 'success',
      message: 'Administrative unit updated successfully',
      data: unit,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 400).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.deleteAdministrativeUnit = async (req, res) => {
  try {
    const result = await deleteAdministrativeUnitService(req.params.id);
    return res.status(200).json({
      status: 'success',
      message: result.message,
      data: null,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 400).json({
      status: 'error',
      message: error.message,
    });
  }
};