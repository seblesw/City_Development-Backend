const { sequelize, LandPayment,PAYMENT_STATUSES,PAYMENT_TYPES, LandRecord, User, Role } = require("../models");
const { Op } = require("sequelize");



const createLandPaymentService = async (data, options = {}) => {
  const { transaction } = options;
  const t = transaction || await sequelize.transaction();

  try {
    // Validate required fields
    const requiredFields = [
      'payment_type', 
      'total_amount', 
      'paid_amount', 
      'land_record_id',
      'payer_id'
    ];
    
    const missingFields = requiredFields.filter(field => !data[field]);
    if (missingFields.length > 0) {
      throw new Error(
        `የሚከተሉት መስኮች አስፈላጊ ናቸው: ${missingFields.join(', ')}`
      );
    }

    // Validate field types
    if (typeof data.land_record_id !== 'number' || data.land_record_id <= 0) {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ መግለጽ አለበት።");
    }

    if (typeof data.payer_id !== 'number' || data.payer_id <= 0) {
      throw new Error("ትክክለኛ ክፍያ ከፋይ መታወቂያ መግለጽ አለበት።");
    }

    // Validate payment type against enum
    if (!Object.values(PAYMENT_TYPES).includes(data.payment_type)) {
      throw new Error(
        `የክፍያ አይነት ከተፈቀዱት ውስጥ መሆን አለበት: ${Object.values(PAYMENT_TYPES).join(', ')}`
      );
    }


    // Validate amounts
    if (typeof data.total_amount !== 'number' || data.total_amount <= 0) {
      throw new Error("የጠቅላላ መጠን ከ 0 በላይ ትክክለኛ ቁጥር መሆን አለበት።");
    }

    if (typeof data.paid_amount !== 'number' || data.paid_amount < 0) {
      throw new Error("የተከፈለው መጠን ከ 0 በላይ ወይም እኩል ትክክለኛ ቁጥር መሆን አለበት።");
    }

    if (data.paid_amount > data.total_amount) {
      throw new Error("የተከፈለው መጠን ከጠቅላላ መጠን መብለጥ �ይችልም።");
    }

    // Auto-set payment status based on amounts
    const payment_status = data.paid_amount >= data.total_amount
      ? PAYMENT_STATUSES.COMPLETED
      : data.paid_amount > 0
        ? PAYMENT_STATUSES.PARTIAL
        : PAYMENT_STATUSES.PENDING;

    // Create payment record
    const payment = await LandPayment.create({
      land_record_id: data.land_record_id,
      payment_type: data.payment_type,
      other_payment_type: data.other_payment_type || null,
      total_amount: data.total_amount,
      paid_amount: data.paid_amount,
      currency: data.currency,
      payment_status,
      penalty_reason: data.penalty_reason || null,
      description: data.description || null,
      payer_id: data.payer_id,
      created_by: data.created_by,
      is_draft: false
    }, { transaction: t });

    // Get the current land record to update action log
    const landRecord = await LandRecord.findByPk(data.land_record_id, { 
      transaction: t,
      lock: true
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    // Update action log - PostgreSQL compatible approach
    const currentLog = Array.isArray(landRecord.action_log) ? landRecord.action_log : [];
    const newLog = [...currentLog, {
      action: 'PAYMENT_CREATED',
      payment_id: payment.id,
      amount: payment.paid_amount,
      currency: payment.currency,
      payment_type: payment.payment_type,
      changed_by: data.created_by,
      changed_at: new Date()
    }];

    await LandRecord.update(
      { action_log: newLog },
      {
        where: { id: data.land_record_id },
        transaction: t
      }
    );

    if (!transaction) await t.commit();
    return payment;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የክፍያ መፍጠር ስህተት: ${error.message}`);
  }
};
const getLandPaymentByIdService = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const payment = await LandPayment.findByPk(id, {
      include: [{ model: LandRecord, as: "landRecord", attributes: ["id", "parcel_number"] }],
      attributes: [
        "id",
        "land_record_id",
        "payment_type",
        "total_amount",
        "paid_amount",
        "currency",
        "payment_status",
        "penalty_reason",
        "description",
        "payer_name",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው የመሬት ክፍያ አልተገኘም።`);
    }
    return payment;
  } catch (error) {
    throw new Error(`የመሬት ክፍያ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

const getPaymentsByLandRecordId = async (landRecordId, options = {}) => {
  const { transaction } = options;
  try {
    const payments = await LandPayment.findAll({
      where: { land_record_id: landRecordId, deletedAt: null },
      include: [{ model: LandRecord, as: "landRecord", attributes: ["id", "parcel_number"] }],
      attributes: [
        "id",
        "land_record_id",
        "payment_type",
        "total_amount",
        "paid_amount",
        "currency",
        "payment_status",
        "penalty_reason",
        "description",
        "createdAt",
        "updatedAt",
      ],
      transaction,
    });
    return payments;
  } catch (error) {
    throw new Error(`የመሬት ክፍያ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

// Update Land Payment Service
// Enhanced Update Land Payment Service
const updateLandPaymentService = async (
  landRecordId,
  paymentData,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Validate inputs
    if (!landRecordId) throw new Error("Land record ID is required");
    if (!paymentData) throw new Error("Payment data is required");
    if (!updater?.id) throw new Error("Updater information is required");

    // Get land record with existing payment
    const landRecord = await LandRecord.findByPk(landRecordId, {
      include: [{
        model: LandPayment,
        as: 'payments',
        where: { deletedAt: null },
        required: false
      }],
      transaction: t
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    // Get existing payment or create new if none exists
    let payment = landRecord.payments?.[0];
    const isNewPayment = !payment;

    // Prepare update payload with only allowed attributes
    const allowedAttributes = {
      payment_type: paymentData.payment_type,
      other_payment_type: paymentData.other_payment_type,
      total_amount: paymentData.total_amount,
      paid_amount: paymentData.paid_amount,
      currency: paymentData.currency,
      payment_status: paymentData.payment_status,
      penalty_reason: paymentData.penalty_reason,
      description: paymentData.description,
      is_draft: paymentData.is_draft,
      payer_id: paymentData.payer_id,
      updated_by: updater.id
    };

    // Validate payment type and status against enums
    if (allowedAttributes.payment_type && 
        !Object.values(PAYMENT_TYPES).includes(allowedAttributes.payment_type)) {
      throw new Error("Invalid payment type");
    }

    if (allowedAttributes.payment_status && 
        !Object.values(PAYMENT_STATUSES).includes(allowedAttributes.payment_status)) {
      throw new Error("Invalid payment status");
    }

    // Special validation for penalty payments
    if (allowedAttributes.payment_type === PAYMENT_TYPES.PENALTY && 
        !allowedAttributes.penalty_reason) {
      throw new Error("Penalty reason is required for penalty payments");
    }

    // Validate amounts
    if (allowedAttributes.total_amount !== undefined && 
        allowedAttributes.total_amount < 0) {
      throw new Error("Total amount cannot be negative");
    }

    if (allowedAttributes.paid_amount !== undefined && 
        allowedAttributes.paid_amount < 0) {
      throw new Error("Paid amount cannot be negative");
    }

    if (allowedAttributes.paid_amount !== undefined && 
        allowedAttributes.total_amount !== undefined && 
        allowedAttributes.paid_amount > allowedAttributes.total_amount) {
      throw new Error("Paid amount cannot exceed total amount");
    }

    if (isNewPayment) {
      // Required fields for new payment
      if (!allowedAttributes.total_amount) {
        throw new Error("Total amount is required for new payments");
      }
      if (!allowedAttributes.payment_type) {
        throw new Error("Payment type is required for new payments");
      }

      payment = await LandPayment.create({
        ...allowedAttributes,
        land_record_id: landRecordId,
        created_by: updater.id
      }, { transaction: t });
    } else {
      // Update existing payment
      await payment.update(allowedAttributes, { transaction: t });
    }

    // Determine payment status based on amounts if not explicitly set
    if (!allowedAttributes.payment_status) {
      let calculatedStatus = PAYMENT_STATUSES.PENDING;
      
      if (payment.paid_amount === payment.total_amount) {
        calculatedStatus = PAYMENT_STATUSES.COMPLETED;
      } else if (payment.paid_amount > 0) {
        calculatedStatus = PAYMENT_STATUSES.PARTIAL;
      }

      await payment.update({ 
        payment_status: calculatedStatus 
      }, { transaction: t });
    }

    // Log payment action
    landRecord.action_log = [
      ...(landRecord.action_log || []),
      {
        action: isNewPayment ? "PAYMENT_CREATED" : "PAYMENT_UPDATED",
        changed_by: updater.id,
        changed_at: new Date(),
        payment_id: payment.id,
        details: {
          type: payment.payment_type,
          total_amount: payment.total_amount,
          paid_amount: payment.paid_amount,
          status: payment.payment_status
        }
      }
    ];

    await landRecord.save({ transaction: t });

    if (!transaction) await t.commit();
    return payment;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`Payment update failed: ${error.message}`);
  }
};

const deleteLandPaymentService = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate deleter role
    const deleter = await User.findByPk(deleterId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!deleter || !["አስተዳደር"].includes(deleter.role?.name)) {
      throw new Error("ክፍያ መሰረዝ የሚችሉት አስተዳደር ብቻ ናቸው።");
    }

    const payment = await LandPayment.findByPk(id, { transaction: t });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው የመሬት ክፍያ አልተገኘም።`);
    }

    // Log deletion in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(payment.land_record_id, { transaction: t });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `PAYMENT_DELETED_${payment.payment_type || "UNKNOWN"}`,
          changed_by: deleterId,
          changed_at: new Date(),
          payment_id: payment.id,
        },
      ];
      await landRecord.save({ transaction: t });
    }

    // Soft delete payment
    await payment.destroy({ transaction: t });

    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው የመሬት ክፍያ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ክፍያ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandPaymentService,
  getLandPaymentByIdService,
  updateLandPaymentService,
  deleteLandPaymentService,
  getPaymentsByLandRecordId,
};