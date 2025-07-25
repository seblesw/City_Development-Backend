const {
  createWoredaService,
  getAllWoredasService,
  getWoredaByIdService,
  updateWoredaService,
  deleteWoredaService,
} = require("../services/woredaService");

exports.createWoreda = async (req, res) => {
  try {
    // const userId = req.user.id;
    const woreda = await createWoredaService(req.body);
    res.status(201).json({
      status: "success",
      data: woreda,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ወረዳ መፍጠር አልተሳካም።",
    });
  }
};

exports.getAllWoredas = async (req, res) => {
  try {
    const woredas = await getAllWoredasService();
    const numberOfWoredas = woredas.length;
    res.status(200).json({
      status: "success",
      numberOfWoredas,
      data: woredas,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ወረዳዎችን ማግኘት አልተሳካም።",
    });
  }
};

exports.getWoredaById = async (req, res) => {
  try {
    const woreda = await getWoredaByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: woreda,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ወረዳ አልተገኘም።",
    });
  }
};

exports.updateWoreda = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    const woreda = await updateWoredaService(req.params.id, req.body, userId);
    res.status(200).json({
      status: "success",
      data: woreda,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ወረዳ ማዘመን አልተሳካም።",
    });
  }
};

exports.deleteWoreda = async (req, res) => {
  try {
    const userId = req.user ? req.user.id : null;
    await deleteWoredaService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ወረዳ መሰረዝ አልተሳካም።",
    });
  }
};