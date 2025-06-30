const landPaymentService = require("../services/landPaymentService");

const createPayment = async (req, res) => {
  try {
    const { body, user } = req;
    const payment = await landPaymentService.createPayment(body, user.id, null);
    res.status(201).json({
      success: true,
      message: "ክፍያ በተሳካ ሁኔታ ተፈጥሯል።",
      data: payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ክፍያ መፍጠር አልተሳካም።",
    });
  }
};

const getPayment = async (req, res) => {
  try {
    const payment = await landPaymentService.getPayment(req.params.id);
    res.status(200).json({ success: true, data: payment });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message || "ክፍያ አልተገኘም።",
    });
  }
};

const updatePayment = async (req, res) => {
  try {
    const payment = await landPaymentService.updatePayment(req.params.id, req.body, req.user.id);
    res.status(200).json({
      success: true,
      message: "ክፍያ በተሳካ ሁኔታ ተዘምኗል።",
      data: payment,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ክፍያ መዘመን አልተሳካም።",
    });
  }
};

const deletePayment = async (req, res) => {
  try {
    const result = await landPaymentService.deletePayment(req.params.id, req.user.id);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ክፍያ መሰረዝ አልተሳካም።",
    });
  }
};

module.exports = { createPayment, getPayment, updatePayment, deletePayment };