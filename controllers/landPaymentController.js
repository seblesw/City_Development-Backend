const { User, LandRecord, LandPayment, PAYMENT_TYPES } = require("../models");
const {
  createLandPaymentService,
  getLandPaymentByIdService,
  deleteLandPaymentService,
  getPaymentsByLandRecordId,
  updateLandPaymentsService,
  addNewPaymentService,
  
} = require("../services/landPaymentService");

const createNewPaymentController = async (req, res) => {  
  try {
    const land_record_id = parseInt(req.params.landId, 10); 
    
    if (isNaN(land_record_id)) {
      return res.status(400).json({ 
        status: "error",
        message: "የተሳሳተ የመሬት መዝገብ ቁጥር" 
      });
    }  

    // Validate payment data
    const { total_amount, paid_amount,initial_payment,anual_payment, lease_year,lease_payment_year } = req.body;


    // Find land record with owners
    const landRecord = await LandRecord.findByPk(land_record_id, {
      include: [
        {
          model: User,
          through: { attributes: [] },
          as: "owners", 
          attributes: ["id", "first_name", "middle_name", "last_name", "phone_number", "email"],
        }
      ],
    });

    if (!landRecord) {
      return res.status(404).json({ 
        status: "error",
        message: "የመሬት መዝገብ አልተገኘም" 
      });
    }

    // Always use the first owner as payer
    const payer_id = landRecord.owners[0].id;
    const user = req.user;

    // Prepare payment data for service
    const paymentData = {
      land_record_id: land_record_id,
      initial_payment: parseFloat(initial_payment) || 0,
      anual_payment: parseFloat(anual_payment) || 0,
      lease_year: lease_year ? parseInt(lease_year) : null,
      currency: "ETB",
      total_amount: parseFloat(total_amount),
      lease_payment_year: lease_payment_year ? parseInt(lease_payment_year) : null,
      paid_amount: parseFloat(paid_amount),
      payment_type: payment_type,
      payer_id: payer_id,
      created_by: user.id
    };

    // Call the existing service to create payment
    const newPayment = await createLandPaymentService(paymentData);

    // Calculate remaining amount
    const remaining_amount = paymentData.total_amount - paymentData.paid_amount;

    return res.status(201).json({
      status: "success",
      message: "አዲስ የመሬት ክፍያ በተሳካ ሁኔታ ተፈጥሯል።",
      data: {
        payment: newPayment,
        summary: {
          totalAmount: paymentData.total_amount,
          paidAmount: paymentData.paid_amount,
          remainingAmount: remaining_amount,
          currency: paymentData.currency,
          paymentStatus: newPayment.payment_status,
          paymentType: paymentData.payment_type
        }
      }
    });

  } catch (error) {
    
    console.error("Create payment error:", error);
    
    // Handle specific error cases
    if (error.message.includes("የክፍያ አይነት ከተፈቀዱት ውስጥ መሆን አለበት")) {
      return res.status(400).json({
        status: "error",
        message: error.message
      });
    }
    
    if (error.message.includes("Land record not found")) {
      return res.status(404).json({
        status: "error",
        message: "የመሬት መዝገብ አልተገኘም"
      });
    }

    if (error.message.includes("ክፍያ ቀድሞውኑ አለ")) {
      return res.status(400).json({
        status: "error",
        message: error.message
      });
    }

    return res.status(400).json({ 
      status: "error",
      message: error.message || "አዲስ ክፍያ መፍጠር አልተሳካም"
    });
  }
};
const getAllPaymentsController = async (req, res) => {
  try {
    const payments = await LandPayment.findAll();
    return res.status(200).json({ data: payments });
  } catch (error) { 
    return res.status(400).json({ error: error.message });
  }
};

const addNewPaymentController = async (req, res) => {  
  try {
    const land_record_id = parseInt(req.params.landId, 10); 
    
    if (isNaN(land_record_id)) {
      return res.status(400).json({ 
        status: "error",
        message: "የተሳሳተ የመሬት መዝገብ ቁጥር" 
      });
    }  

    // Get all payment data from request body
    const { 
      paid_amount, 
      total_amount, 
      initial_payment, 
      anual_payment, 
      lease_year, 
      lease_payment_year,
      description,
      penalty_reason 
    } = req.body;

    // Validate payment amount
    if (!paid_amount || paid_amount <= 0) {
      return res.status(400).json({
        status: "error",
        message: "የክፍያ መጠን መግለጽ አለበት እና ከዜሮ በላይ መሆን አለበት"
      });
    }

    // Find land record with owners
    const landRecord = await LandRecord.findByPk(land_record_id, {
      include: [
        {
          model: User,
          through: { attributes: [] },
          as: "owners", 
          attributes: ["id", "first_name", "middle_name", "last_name", "phone_number", "email"],
        }
      ],
    });

    if (!landRecord) {
      return res.status(404).json({ 
        status: "error",
        message: "የመሬት መዝገብ አልተገኘም" 
      });
    }

    // Check if there are owners
    if (!landRecord.owners || landRecord.owners.length === 0) {
      return res.status(404).json({ 
        status: "error",
        message: "ለዚህ የመሬት መዝገብ ባለቤት አልተገኘም" 
      });
    }

    // Always use the first owner as payer
    const payer_id = landRecord.owners[0].id;
    const user = req.user;

    // Call the service with all payment data from request body
    const result = await addNewPaymentService(
      land_record_id, 
      user,
      {
        paid_amount,
        total_amount,
        initial_payment,
        anual_payment,
        lease_year,
        lease_payment_year,
        description,
        penalty_reason,
        payer_id
      }
    );

    return res.status(201).json({
      status: "success",
      message: "ተጨማሪ የመሬት ክፍያ በተሳካ ሁኔታ ታክሏል።",
      data: {
        payment: result.additionalPayment,
        summary: result.summary,
        updatedPayment: result.originalPayment
      }
    });

  } catch (error) {
    
    console.error("Add payment error:", error);
    
    // Handle specific error cases
    if (error.message.includes("የክፍያ መጠን ከጠቅላላ መጠን መብለጥ")) {
      return res.status(400).json({
        status: "error",
        message: error.message
      });
    }
    
    if (error.message.includes("የቀድሞ ክፍያ አልተገኘም")) {
      return res.status(404).json({
        status: "error",
        message: error.message
      });
    }

    return res.status(400).json({ 
      status: "error",
      message: error.message || "የክፍያ መጨመር አልተሳካም"
    });
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

    
    const newPaymentsData = [{
      id: parsedPaymentId, 
      ...paymentUpdates,
    }];

    
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
  createNewPaymentController,
  getAllPaymentsController,
  addNewPaymentController,
  getPaymentsByLandRecordIdController,
  getLandPaymentByIdController,
  updateSinglePaymentController,
  deleteLandPaymentController,
};
