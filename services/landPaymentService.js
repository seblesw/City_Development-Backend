const { sequelize, LandPayment, LandRecord, User, Role } = require("../models");
const { Op } = require("sequelize");

const PAYMENT_STATUSES = {
  PENDING: "በመጠባበቅ ላይ",
  COMPLETED: "ተጠናቋል",
  FAILED: "አልተሳካም",
  CANCELLED: "ተሰርዟል",
};

const createLandPaymentService = async (data, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    if (!data.land_record_id || !data.total_amount || !data.paid_amount || !data.payer_name) {
      throw new Error("የመሬት መዝገብ፣ ጠቅላላ ገንዘብ፣ የተከፈለ ገንዘብ፣ እና የክፍያ አድራጊ ስም መግለጽ አለባቸው።");
    }

    t = t || (await sequelize.transaction());

  

    // Validate land_record_id
    const landRecord = await LandRecord.findByPk(data.land_record_id, { transaction: t });
    if (!landRecord) {
      throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
    }

    // Create payment
    const paymentData = {
      land_record_id: data.land_record_id,
      payment_type: data.payment_type || null,
      total_amount: data.total_amount,
      paid_amount: data.paid_amount,
      currency: data.currency || "ETB",
      payment_status: data.payment_status || PAYMENT_STATUSES.PENDING,
      penalty_reason: data.penalty_reason || null,
      description: data.description || null,
      payer_name: data.payer_name,
    };
    const payment = await LandPayment.create(paymentData, { transaction: t });

    // Log payment creation in LandRecord.action_log
    landRecord.action_log = [
      ...(landRecord.action_log || []),
      {
        action: `PAYMENT_CREATED_${payment.payment_type || "UNKNOWN"}`,
        changed_at: payment.createdAt || new Date(),
        payment_id: payment.id,
      },
    ];
    await landRecord.save({ transaction: t });

    if (!transaction) await t.commit();
    return payment;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ክፍያ መፍጠር ስህተት: ${error.message}`);
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

const updateLandPaymentService = async (id, data, updaterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate updater role
    const updater = await User.findByPk(updaterId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!updater || !["መዝጋቢ", "አስተዳደር"].includes(updater.role?.name)) {
      throw new Error("ክፍያ መቀየር የሚችሉት መዝጋቢ ወዯም አስተዳደር ብቻ ናቸው።");
    }

    const payment = await LandPayment.findByPk(id, { transaction: t });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው የመሬት ክፍያ አልተገኘም።`);
    }

    // Validate land_record_id if changed
    if (data.land_record_id && data.land_record_id !== payment.land_record_id) {
      const landRecord = await LandRecord.findByPk(data.land_record_id, { transaction: t });
      if (!landRecord) {
        throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
      }
    }

    // Validate payment_status transitions
    if (data.payment_status && data.payment_status !== payment.payment_status) {
      const validTransitions = {
        [PAYMENT_STATUSES.PENDING]: [
          PAYMENT_STATUSES.COMPLETED,
          PAYMENT_STATUSES.FAILED,
          PAYMENT_STATUSES.CANCELLED,
        ],
        [PAYMENT_STATUSES.FAILED]: [PAYMENT_STATUSES.PENDING],
        [PAYMENT_STATUSES.COMPLETED]: [],
        [PAYMENT_STATUSES.CANCELLED]: [],
      };
      const previousStatus = payment.payment_status;
      if (!validTransitions[previousStatus]?.includes(data.payment_status)) {
        throw new Error(`ከ${previousStatus} ወደ ${data.payment_status} መሸጋገር አይችልም።`);
      }
    }

    // Prepare update data
    const updateData = {};
    const updatableFields = [
      "land_record_id",
      "payment_type",
      "total_amount",
      "paid_amount",
      "currency",
      "payment_status",
      "penalty_reason",
      "description",
      "payer_name",
    ];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    // Log payment update in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(payment.land_record_id, { transaction: t });
    if (landRecord && Object.keys(updateData).length > 0) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `PAYMENT_UPDATED_${payment.payment_type || "UNKNOWN"}`,
          changed_by: updaterId,
          changed_at: new Date(),
          payment_id: payment.id,
        },
      ];
      await landRecord.save({ transaction: t });
    }

    // Update payment
    updateData.updated_at = new Date();
    await payment.update(updateData, { transaction: t });

    if (!transaction) await t.commit();
    return payment;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ክፍያ መቀየር ስህተት: ${error.message}`);
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
};