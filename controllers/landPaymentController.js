const {
  createLandPaymentService,
  getLandPaymentByIdService,
  updateLandPaymentService,
  deleteLandPaymentService,
} = require("../services/landPaymentService");

const createLandPaymentController = async (req, res) => {
  try {
    const { body,  } = req;
    // if (!user) {
    //   return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    // }
    const data = {
      land_record_id: body.land_record_id,
      payment_type: body.payment_type,
      total_amount: body.total_amount,
      paid_amount: body.paid_amount,
      currency: body.currency || "ETB",
      payment_status: body.payment_status || PAYMENT_STATUSES.PENDING,
      penalty_reason: body.penalty_reason || null,
      description: body.description || null,
      payer_name: body.payer_name,
    };
    const payment = await createLandPaymentService(data);
    return res.status(201).json({
      message: "የመሬት ክፍያ በተሳካ ሁኔታ ተፈጥሯል።",
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const getLandPaymentByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await getLandPaymentByIdService(id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው የመሬት ክፍያ በተሳካ ሁኔታ ተገኝቷል።`,
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updateLandPaymentController = async (req, res) => {
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
      payer_name: body.payer_name,
    };
    const payment = await updateLandPaymentService(id, data, user.id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው የመሬት ክፍያ በተሳካ ሁኔታ ተቀይሯል።`,
      data: payment,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const deleteLandPaymentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const result = await deleteLandPaymentService(id, user.id);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createLandPaymentController,
  getLandPaymentByIdController,
  updateLandPaymentController,
  deleteLandPaymentController,
};
