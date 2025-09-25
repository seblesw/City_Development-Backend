const {
  sequelize,
  LandPayment,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  LandRecord,
  User,
  Role,
} = require("../models");
const { Op } = require("sequelize");
const addNewPaymentService = async (landRecordId, user, data) => {
  const {
    payment_type,
    total_amount,
    paid_amount,
    annual_payment,
    initial_payment,
    currency,
    payment_status,
    penalty_reason,
    description,
    payer_id,
  } = data;

  // 1. Validate land record exists
  const landRecord = await LandRecord.findByPk(landRecordId);
  if (!landRecord) {
    throw new Error("የመሬት መዝገብ አልተገኘም።");
  }

  // 2. Create new payment record
  const payment = await LandPayment.create({
    land_record_id: landRecordId,
    payment_type,
    total_amount,
    paid_amount,
    annual_payment: annual_payment || null,
    initial_payment: initial_payment || null,
    currency: currency || "ETB",
    payment_status: payment_status || PAYMENT_STATUSES.PENDING,
    penalty_reason: penalty_reason || null,
    description: description || null,
    payer_id,
    created_by: user.id,
  });

  // 3. Update land record action log
  const currentLog = Array.isArray(landRecord.action_log) ? landRecord.action_log : [];
  const newLog = [
    ...currentLog,
    {
      action: "አዲስ ክፍያ ተጨምሯል",
      payment_id: payment.id,
      amount: payment.paid_amount,
      currency: payment.currency,
      payment_type: payment.payment_type,
      changed_by: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
      },
      changed_at: new Date(),
    },
  ];
  await LandRecord.update(
    { action_log: newLog },
    { where: { id: landRecordId } }
  );

  return payment;
};

const createLandPaymentService = async (data, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // --- 1. Required field validation ---
    const requiredFields = [
      "payment_type",
      "total_amount",
      "paid_amount",
      "land_record_id",
      "payer_id",
    ];
    const missingFields = requiredFields.filter(
      (field) => data[field] === undefined || data[field] === null
    );
    if (missingFields.length > 0) {
      throw new Error(`የሚከተሉት መስኮች አስፈላጊ ናቸው: ${missingFields.join(", ")}`);
    }

    // --- 2. Type & value validation ---
    if (typeof data.land_record_id !== "number" || data.land_record_id <= 0) {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ መግለጽ አለበት።");
    }
    if (typeof data.payer_id !== "number" || data.payer_id <= 0) {
      throw new Error("ትክክለኛ ክፍያ ከፋይ መታወቂያ መግለጽ አለበት።");
    }
    if (!Object.values(PAYMENT_TYPES).includes(data.payment_type)) {
      throw new Error(
        `የክፍያ አይነት ከተፈቀዱት ውስጥ መሆን አለበት: ${Object.values(PAYMENT_TYPES).join(
          ", "
        )}`
      );
    }
    if (data.total_amount <= 0) {
      throw new Error("የጠቅላላ መጠን ከ 0 በላይ ትክክለኛ ቁጥር መሆን አለበት።");
    }
    if ( data.paid_amount < 0) {
      throw new Error("የተከፈለው መጠን ከ 0 በላይ ወይም እኩል ትክክለኛ ቁጥር መሆን አለበት።");
    }
    if (data.paid_amount > data.total_amount) {
      throw new Error("የተከፈለው መጠን ከጠቅላላ መጠን መብለጥ አይችልም።");
    }

    // --- 3. Auto-set payment status ---
    const payment_status =
      data.paid_amount >= data.total_amount
        ? PAYMENT_STATUSES.COMPLETED
        : data.paid_amount > 0
        ? PAYMENT_STATUSES.PARTIAL
        : PAYMENT_STATUSES.PENDING;

    // --- 4. Create payment record ---
    const payment = await LandPayment.create(
      {
        land_record_id: data.land_record_id,
        payment_type: data.payment_type,
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        anual_payment: data.anual_payment || null,
        initial_payment: data.initial_payment || null,
        currency: data.currency || "ETB",
        payment_status,
        penalty_reason: data.penalty_reason || null,
        description: data.description || null,
        payer_id: data.payer_id,
        created_by: data.created_by,
        is_draft: false,
      },
      { transaction: t }
    );

    // --- 5. Lock and update land record action log ---
    const landRecord = await LandRecord.findByPk(data.land_record_id, {
      transaction: t,
      lock: transaction ? undefined : t.LOCK.UPDATE,
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    const currentLog = Array.isArray(landRecord.action_log)
      ? landRecord.action_log
      : [];
    // Fetch creator's user info
    let creator = null;
    if (data.created_by) {
      creator = await User.findByPk(data.created_by, { transaction: t });
    }
    const newLog = [
      ...currentLog,
      {
        action: "ክፍያ ተጨምሯል",
        payment_id: payment.id,
        amount: payment.paid_amount,
        currency: payment.currency,
        payment_type: payment.payment_type,
        changed_by: 
           {
              id: creator.id,
              first_name: creator.first_name,
              middle_name: creator.middle_name,
              last_name: creator.last_name,
            },
        changed_at: new Date(),
      },
    ];

    await LandRecord.update(
      { action_log: newLog },
      { where: { id: data.land_record_id }, transaction: t }
    );

    // --- 6. Commit only if we started the transaction ---
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
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          //commented to get all attribuetes of land record
          // attributes: ["id", "parcel_number"],
        },
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
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
          include: [
            {
              model: User,
              through: { attributes: [] },
              as: "owners",
              attributes: [
                "id",
                "first_name",
                "middle_name",
                "last_name",
                "email",
              ],
              include: [
                {
                  model: Role,
                  as: "role",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
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
    // First get the current land record to maintain its action log
    const landRecord = await LandRecord.findOne({
      where: { id: landRecordId },
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    const updatedPayments = await Promise.all(
      newPaymentsData.map(async (paymentData) => {
        const paymentToUpdate = existingPayments.find(
          (p) => p.id === paymentData.id
        );

        if (!paymentToUpdate) {
          throw new Error(`ይህ የክፍያ አይዲ ${paymentData.id} ያለው ክፍያ አልተገኘም።`);
        }

        // Capture changes for logging
        const changes = {};
        Object.keys(paymentData).forEach((key) => {
          if (
            paymentToUpdate[key] !== paymentData[key] &&
            key !== "updated_at" &&
            key !== "created_at"
          ) {
            changes[key] = {
              from: paymentToUpdate[key],
              to: paymentData[key],
            };
          }
        });

        // Directly use the paymentData from body, only adding updated_by
        const updatePayload = {
          ...paymentData,
          updated_by: updater.id,
        };

        // Auto-calculate status if paid_amount was provided
        if (paymentData.paid_amount !== undefined) {
          if (
            paymentData.paid_amount >=
            (paymentData.total_amount || paymentToUpdate.total_amount)
          ) {
            updatePayload.payment_status = PAYMENT_STATUSES.COMPLETED;
          } else if (paymentData.paid_amount > 0) {
            updatePayload.payment_status = PAYMENT_STATUSES.PARTIAL;
          } else {
            updatePayload.payment_status = PAYMENT_STATUSES.PENDING;
          }
        }

        await paymentToUpdate.update(updatePayload, { transaction: t });

        // Only log if there were actual changes
        if (Object.keys(changes).length > 0) {
          const currentLog = Array.isArray(landRecord.action_log)
            ? landRecord.action_log
            : [];
          const newLog = [
            ...currentLog,
            {
              action: "ክፍያ ተሻሽሏል",
              payment_id: paymentToUpdate.id,
              amount:
                paymentData.paid_amount !== undefined
                  ? paymentData.paid_amount
                  : paymentToUpdate.paid_amount,
              currency: paymentData.currency || paymentToUpdate.currency,
              payment_type:
                paymentData.payment_type || paymentToUpdate.payment_type,
              changes: changes, 
              changed_by: {
                id: updater.id,
                first_name: updater.first_name,
                middle_name: updater.middle_name,
              },
              changed_at: new Date(),
            },
          ];

          await LandRecord.update(
            { action_log: newLog },
            {
              where: { id: landRecordId },
              transaction: t,
            }
          );
        }

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

    const payment = await LandPayment.findByPk(id, { transaction: t });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው የመሬት ክፍያ አልተገኘም።`);
    }

    // Log deletion in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(payment.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `ክፍያ ተሰርዟል_${payment.payment_type || "UNKNOWN"}`,
          changed_by: deleterId,
          changed_at: new Date(),
          payment_id: payment.id,
        },
      ];
      await landRecord.save({ transaction: t });
    }

    // Soft delete payment
    await payment.destroy({ force: true, transaction: t });

    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው የመሬት ክፍያ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ክፍያ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandPaymentService,
  addNewPaymentService,
  getLandPaymentByIdService,
  updateLandPaymentsService,
  deleteLandPaymentService,
  getPaymentsByLandRecordId,
};
