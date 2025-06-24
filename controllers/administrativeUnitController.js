const {
  createAdministrativeUnitService,
  getAllAdministrativeUnitsService,
  getAdministrativeUnitByIdService,
  updateAdministrativeUnitService,
  deleteAdministrativeUnitService,
} = require("../services/administrativeUnitService");

exports.createAdministrativeUnit = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const unit = await createAdministrativeUnitService(req.body, userId);
    res.status(201).json({
      status: "success",
      data: unit,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "አስተዳደር ክፍል መፍጠር አልተሳካም።",
    });
  }
};

exports.getAllAdministrativeUnits = async (req, res) => {
  try {
    const units = await getAllAdministrativeUnitsService();
    const numberOfUnits = units.length;
    res.status(200).json({
      status: "success",
      numberOfUnits,
      data: units,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "አስተዳደር ክፍሎችን ማግኘት አልተሳካም።",
    });
  }
};

exports.getAdministrativeUnitById = async (req, res) => {
  try {
    const unit = await getAdministrativeUnitByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: unit,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "አስተዳደር ክፍል አልተገኘም።",
    });
  }
};

exports.updateAdministrativeUnit = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const unit = await updateAdministrativeUnitService(req.params.id, req.body, userId);
    res.status(200).json({
      status: "success",
      data: unit,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "አስተዳደር ክፍል ማዘመን አልተሳካም።",
    });
  }
};

exports.deleteAdministrativeUnit = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    await deleteAdministrativeUnitService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "አስተዳደር ክፍል መሰረዝ አልተሳካም።",
    });
  }
};