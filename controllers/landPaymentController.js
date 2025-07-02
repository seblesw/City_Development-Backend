const { createPayment, getPaymentById, updatePayment, deletePayment } = require("../services/landPaymentService");

const createPaymentController = async (req, res) => {
  try {
    const { body, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const data = {
      land_record_id: body.land_record_id,
      payment_type: body.payment_type,
      total_amount: body.total_amount,
      paid_amount: body.paid_amount,
      currency: body.currency,
      payment_status: body.payment_status,
      penalty_reason: body.penalty_reason,
      description: body.description,
      payer_id: body.payer_id || user.id,
    };
    const payment = await createPayment(data, user.id);
    return res.status(201).json({
      message: "ክፍያ በተሳካ ሁኔታ ተፈጥሯል።",
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const getPaymentByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getPaymentById(id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ክፍያ በተሳካ ሁኔታ ተገኝቷል።`,
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updatePaymentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const data = {
      land_record_id: body.land_record_id,
      payment_type: body.payment_type,
      total_amount: body.total_amount,
      paid_amount: body.paid_amount,
      currency: body.currency,
      payment_status: body.payment_status,
      penalty_reason: body.penalty_reason,
      description: body.description,
      payer_id: body.payer_id,
    };
    const payment = await updatePayment(id, data, user.id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ክፍያ በተሳካ ሁኔታ ተቀይሯል።`,
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const deletePaymentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const result = await deletePayment(id, user.id);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createPaymentController,
  getPaymentByIdController,
  updatePaymentController,
  deletePaymentController,
};