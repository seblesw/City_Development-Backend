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

    // Validate currency against enum
    // if (!['ETB', 'USD'].includes(data.currency)) {
    //   throw new Error("ምንዛሪ ከ ETB ወይም USD መሆን አለበት።");
    // }

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
const updateLandPaymentsService = async (
  landRecordId,
  existingPayments,
  newPaymentsData,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Process each payment update
    const updatedPayments = await Promise.all(
      newPaymentsData.map(async (paymentData) => {
        // Find the payment in existing payments
        const paymentToUpdate = existingPayments.find(p => p.id === paymentData.id);
        
        if (!paymentToUpdate) {
          throw new Error(`Payment with ID ${paymentData.id} not found for this land record`);
        }

        // Prepare update payload
        const updatePayload = {
          payment_type: paymentData.payment_type || paymentToUpdate.payment_type,
          total_amount: paymentData.total_amount !== undefined 
            ? paymentData.total_amount 
            : paymentToUpdate.total_amount,
          paid_amount: paymentData.paid_amount !== undefined 
            ? paymentData.paid_amount 
            : paymentToUpdate.paid_amount,
          payment_status: paymentData.payment_status || paymentToUpdate.payment_status,
          currency: paymentData.currency || paymentToUpdate.currency,
          description: paymentData.description || paymentToUpdate.description,
          updated_by: updater.id
        };

        // Auto-calculate status if amount changed
        if (paymentData.paid_amount !== undefined) {
          if (updatePayload.paid_amount >= updatePayload.total_amount) {
            updatePayload.payment_status = PAYMENT_STATUSES.COMPLETED;
          } else if (updatePayload.paid_amount > 0) {
            updatePayload.payment_status = PAYMENT_STATUSES.PARTIAL;
          } else {
            updatePayload.payment_status = PAYMENT_STATUSES.PENDING;
          }
        }

        // Perform the update
        await paymentToUpdate.update(updatePayload, { transaction: t });
        return paymentToUpdate;
      })
    );

    if (!transaction) await t.commit();
    return updatedPayments;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
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
  updateLandPaymentsService,
  deleteLandPaymentService,
  getPaymentsByLandRecordId,
};