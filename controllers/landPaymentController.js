const { User, LandRecord } = require("../models");
const {
  createLandPaymentService,
  getLandPaymentByIdService,
  updateLandPaymentService,
  deleteLandPaymentService,
  
} = require("../services/landPaymentService");

const addNewPaymentController = async (req, res) => {
  try {
    const land_record_id = parseInt(req.params.landId, 10); 
    
    if (isNaN(land_record_id)) {
      return res.status(400).json({ error: "Invalid land_record_id" });
    }  

     const landRecord = await LandRecord.findByPk(land_record_id, {
      include: [
        {
          model: User,
          through: { attributes: [] },
          as: "owners", 
          attributes: ["id", "first_name", "middle_name", "email"],
        },
      ],
    });

    if (!landRecord || !landRecord.owners || landRecord.owners.length === 0) {
      return res.status(404).json({ error: "No owners found for this land record" });
    }

    const payer_id = landRecord.owners[0].id; 
    const user = req.user;

    const paymentData = {
      ...req.body,
      land_record_id,
      payer_id,
      created_by: user.id
    };

    const payment = await createLandPaymentService(paymentData);

    return res.status(201).json({
      message: "ተጨማሪ የመሬት ክፍያ በተሳካ ሁኔታ ተፈጥሯል።",
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
  addNewPaymentController,
  getLandPaymentByIdController,
  updateLandPaymentController,
  deleteLandPaymentController,
};
