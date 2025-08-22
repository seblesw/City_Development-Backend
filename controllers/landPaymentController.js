const { User, LandRecord, LandPayment } = require("../models");
const {
  createLandPaymentService,
  getLandPaymentByIdService,
  deleteLandPaymentService,
  getPaymentsByLandRecordId,
  updateLandPaymentsService,
  
} = require("../services/landPaymentService");

const addNewPaymentController = async (req, res) => {
  try {
    const land_record_id = parseInt(req.params.landId, 10); 
    
    if (isNaN(land_record_id)) {
      return res.status(400).json({ error: "የተሳሳተ የ መዝገብ ቁጥር" });
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
      return res.status(404).json({ error: "በዚህ መዝገብ ባለቤት አይገኝም" });
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

const getPaymentsByLandRecordIdController = async (req, res) => {
  try {
    const { landId } = req.params;
    const payments = await getPaymentsByLandRecordId(landId);
    if (!payments || payments.length === 0) {
      return res.status(404).json({ error: "በዚህ መዝገብ ውስጥ ምንም አይነት ክፍያ የለም" });
    }
    return res.status(200).json({
      message: `የመሬት መዝገብ መለያ ${landId} ያለው የመሬት ክፍያ በተሳካ ሁኔታ ተገኝቷል።`,
      data: payments, 
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
}

const updateSinglePaymentController = async (req, res) => {
  const { landRecordId, paymentId } = req.params;
  const parsedPaymentId = parseInt(paymentId, 10); 
  const paymentUpdates = req.body;
  const updater = req.user;

  try {
    // 1. Fetch the land record with its payments
    const landRecord = await LandRecord.findOne({
      where: { id: landRecordId },
      include: [{ model: LandPayment, as: 'payments' }],
    });

    if (!landRecord) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    // 2. Find the specific payment to update
    const existingPayments = landRecord.payments || [];
    const paymentToUpdate = existingPayments.find(
      (p) => p.id === parsedPaymentId 
    );

    if (!paymentToUpdate) {
      return res.status(404).json({
        success: false,
        message: `ይህ የክፍያ አይዲ ${paymentId} ያለው ክፍያ አልተገኘም።`,
      });
    }

    // 3. Prepare the payload (only the single payment to update)
    const newPaymentsData = [{
      id: parsedPaymentId, 
      ...paymentUpdates,
    }];

    // 4. Reuse the existing service
    const updatedPayments = await updateLandPaymentsService(
      landRecordId,
      existingPayments,
      newPaymentsData,
      updater
    );

    return res.status(200).json({
      success: true,
      data: updatedPayments[0],
      message: "ክፍያ በተሳካ ሁኔታ ዘምኗል",
    });
  } catch (error) {
    console.error("Error updating payment:", error.message);
    return res.status(400).json({
      success: false,
      message: error.message || "ክፍያ �ማዘመን አልተሳካም",
    });
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
  getPaymentsByLandRecordIdController,
  getLandPaymentByIdController,
  updateSinglePaymentController,
  deleteLandPaymentController,
};
