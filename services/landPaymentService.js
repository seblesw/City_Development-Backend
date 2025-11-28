const {
  sequelize,
  LandPayment,
  PAYMENT_STATUSES,
  PAYMENT_TYPES,
  LandRecord,
  User,
  Role,
  ActionLog,
  LAND_PREPARATION,
} = require("../models");
const { Op } = require("sequelize");

const derivePaymentTypeFromLandPreparation = (
  landPreparation,
  fallbackType = null
) => {
  if (landPreparation === LAND_PREPARATION.LEASE) {
    return PAYMENT_TYPES.LEASE_PAYMENT;
  }
  if (landPreparation === LAND_PREPARATION.EXISTING) {
    return PAYMENT_TYPES.TAX;
  }
  return fallbackType || PAYMENT_TYPES.PENALTY;
};
const addNewPaymentService = async (landRecordId, user, paymentData = {}) => {
  const t = await sequelize.transaction();

  try {
    // Validate land record
    const landRecord = await LandRecord.findByPk(landRecordId, { transaction: t });
    if (!landRecord) {
      throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    // Validate payment amount
    const newPaidAmount = parseFloat(paymentData.paid_amount);
    if (!paymentData.paid_amount || newPaidAmount <= 0) {
      throw new Error("የክፍያ መጠን መግለጽ አለበት እና ከዜሮ በላይ መሆን አለበት።");
    }

    // Find the existing payment
    const existingPayment = await LandPayment.findOne({
      where: { land_record_id: landRecordId },
      order: [['createdAt', 'DESC']],
      transaction: t
    });

    if (!existingPayment) {
      throw new Error("ለዚህ የመሬት መዝገብ የቀድሞ ክፍያ አልተገኘም።");
    }

    // Get current amounts
    const existingTotal = parseFloat(existingPayment.total_amount);
    const currentPaid = parseFloat(existingPayment.paid_amount);
    
    let totalAmount = existingTotal;
    let updatedPaymentData = {};

    // If existing total is 0 and new total is provided, update the total amount and other fields
    if (existingTotal === 0) {
      // Validate that total_amount is provided when existing total is 0
      if (!paymentData.total_amount || paymentData.total_amount <= 0) {
        throw new Error("የጠቅላላ ክፍያ መጠን መግለጽ አለበት እና ከዜሮ በላይ መሆን አለበት");
      }

      totalAmount = parseFloat(paymentData.total_amount);
      
      // Update payment with new total amount and additional fields
      updatedPaymentData = {
        total_amount: totalAmount,
        paid_amount: currentPaid + newPaidAmount,
        remaining_amount: totalAmount - (currentPaid + newPaidAmount)
      };

      // Add lease-specific fields if payment type is lease
      if (existingPayment.payment_type === PAYMENT_TYPES.LEASE_PAYMENT) {
        if (paymentData.initial_payment) {
          updatedPaymentData.initial_payment = parseFloat(paymentData.initial_payment);
        }
        if (paymentData.annual_payment) {
          updatedPaymentData.annual_payment = parseFloat(paymentData.annual_payment);
        }
        if (paymentData.lease_year) {
          updatedPaymentData.lease_year = paymentData.lease_year;
        }
        if (paymentData.lease_payment_year) {
          updatedPaymentData.lease_payment_year = paymentData.lease_payment_year;
        }
      }

      // Add penalty reason for penalty type
      if (existingPayment.payment_type === PAYMENT_TYPES.PENALTY && paymentData.penalty_reason) {
        updatedPaymentData.penalty_reason = paymentData.penalty_reason;
      }

      // Add description for all types
      if (paymentData.description) {
        updatedPaymentData.description = paymentData.description;
      }
    } else {
      // Normal case - existing total amount is valid
      const currentRemaining = parseFloat(existingPayment.remaining_amount) || totalAmount - currentPaid;

      // Check if payment is already completed
      if (currentRemaining <= 0) {
        throw new Error("ክፍያው ቀድሞውኑ ሙሉ በሙሉ ተከፍሏል። ተጨማሪ ክፍያ ማከል አይቻልም።");
      }

      // Check if new payment exceeds remaining amount
      if (newPaidAmount > currentRemaining) {
        throw new Error(`የክፍያ መጠን ከቀረው መጠን መብለጥ አይችልም። ከፍተኛ የሚከፈለው: ${currentRemaining} ${existingPayment.currency}`);
      }

      // Calculate new amounts for normal case
      updatedPaymentData = {
        paid_amount: currentPaid + newPaidAmount,
        remaining_amount: totalAmount - (currentPaid + newPaidAmount)
      };

      // For tax and penalty payments when total > 0, also update total amount if provided
      if (existingPayment.payment_type === PAYMENT_TYPES.TAX || existingPayment.payment_type === PAYMENT_TYPES.PENALTY) {
        if (paymentData.total_amount && paymentData.total_amount > 0) {
          updatedPaymentData.total_amount = parseFloat(paymentData.total_amount);
          updatedPaymentData.remaining_amount = parseFloat(paymentData.total_amount) - (currentPaid + newPaidAmount);
          totalAmount = parseFloat(paymentData.total_amount);
        }
      }

      // Add penalty reason for penalty type when total > 0
      if (existingPayment.payment_type === PAYMENT_TYPES.PENALTY && paymentData.penalty_reason) {
        updatedPaymentData.penalty_reason = paymentData.penalty_reason;
      }
    }

    // Determine payment status
    const updatedPaid = updatedPaymentData.paid_amount;
    const updatedRemaining = updatedPaymentData.remaining_amount;
    
    let paymentStatus;
    if (updatedRemaining <= 0) {
      paymentStatus = PAYMENT_STATUSES.COMPLETED;
    } else if (updatedPaid > 0) {
      paymentStatus = PAYMENT_STATUSES.PARTIAL;
    } else {
      paymentStatus = existingPayment.payment_status;
    }

    updatedPaymentData.payment_status = paymentStatus;

    // Update the existing payment
    await existingPayment.update(updatedPaymentData, { transaction: t });

    // Get creator info for ActionLog
    let creator = null;
    if (user.id) {
      creator = await User.findByPk(user.id, { 
        attributes: ["id", "first_name", "middle_name", "last_name"],
        transaction: t 
      });
    }

    // Create ActionLog entry for payment update
    await ActionLog.create({
      land_record_id: landRecordId,
      performed_by: user.id,
      action_type: 'PAYMENT_UPDATED',
      notes: `ክፍያ ታክሏል - አዲስ ክፍያ: ${newPaidAmount} ${existingPayment.currency}, አጠቃላይ የተከፈለ: ${updatedPaid} ${existingPayment.currency}`,
      additional_data: {
        payment_id: existingPayment.id,
        payment_type: existingPayment.payment_type,
        previous_paid_amount: currentPaid,
        new_payment_amount: newPaidAmount,
        updated_paid_amount: updatedPaid,
        total_amount: totalAmount,
        remaining_amount: updatedRemaining,
        payment_status: paymentStatus,
        currency: existingPayment.currency,
        changed_by_name: creator ? `${creator.first_name} ${creator.middle_name || ''} ${creator.last_name}`.trim() : 'Unknown',
        parcel_number: landRecord.parcel_number,
        ...(existingTotal === 0 && {
          initial_payment: updatedPaymentData.initial_payment,
          annual_payment: updatedPaymentData.annual_payment,
          lease_year: updatedPaymentData.lease_year,
          lease_payment_year: updatedPaymentData.lease_payment_year
        })
      }
    }, { transaction: t });

    await t.commit();

    return {
      success: true,
      previousPaid: currentPaid,
      newPayment: newPaidAmount,
      totalPaid: updatedPaid,
      remaining: updatedRemaining,
      totalAmount: totalAmount,
      paymentStatus: paymentStatus,
      currency: existingPayment.currency,
      updatedFields: existingTotal === 0 ? 'total_amount and lease fields updated' : 'paid_amount updated'
    };

  } catch (error) {
    await t.rollback();
    throw new Error(`የክፋያ መጨመር ስህተት: ${error.message}`);
  }
};

const createLandPaymentService = async (data, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    
    if (typeof data.land_record_id !== "number" || data.land_record_id <= 0) {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ መግለጽ አለበት።");
    }
    const landRecord = await LandRecord.findByPk(data.land_record_id, {
      transaction: t,
      lock: transaction ? undefined : t.LOCK.UPDATE,
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    const resolvedPaymentType = derivePaymentTypeFromLandPreparation(
      landRecord.land_preparation,
      data.payment_type
    );

    if (!Object.values(PAYMENT_TYPES).includes(resolvedPaymentType)) {
      throw new Error(
        `የክፍያ አይነት ከተፈቀዱት ውስጥ መሆን አለበት: ${Object.values(
          PAYMENT_TYPES
        ).join(", ")}`
      );
    }
    
    const payment_status =
      data.paid_amount >= data.total_amount
        ? PAYMENT_STATUSES.COMPLETED
        : data.paid_amount > 0
        ? PAYMENT_STATUSES.PARTIAL
        : PAYMENT_STATUSES.PENDING;

    
    const payment = await LandPayment.create(
      {
        land_record_id: data.land_record_id,
        payment_type: resolvedPaymentType,
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        remaining_amount: data.total_amount - data.paid_amount,
        lease_year: data.lease_year,
        lease_payment_year: data.lease_payment_year || 0,
        annual_payment: data.annual_payment || 0,
        initial_payment: data.initial_payment || 0,
        currency: data.currency || "ETB",
        payment_status,
        penalty_reason: data.penalty_reason || 0,
        description: data.description || 0,
        payer_id: data.payer_id || null,
        created_by: data.created_by,
      },
      { transaction: t }
    );

    //  Get creator info for ActionLog
    let creator = null;
    if (data.created_by) {
      creator = await User.findByPk(data.created_by, { 
        attributes: ["id", "first_name", "middle_name", "last_name"],
        transaction: t 
      });
    }

    //  Create ActionLog entry for payment creation (replaces the old action_log)
    await ActionLog.create({
      land_record_id: data.land_record_id,
      performed_by: data.created_by,
      action_type: 'PAYMENT_CREATED',
      notes: `ክፍያ ተጨምሯል - አጠቃላይ: ${data.total_amount} ${data.currency || 'ETB'}, የተከፈለ: ${data.paid_amount} ${data.currency || 'ETB'}`,
      additional_data: {
        payment_id: payment.id,
        payment_type: resolvedPaymentType,
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        currency: data.currency || "ETB",
        payment_status: payment_status,
        remaining_amount: data.total_amount - data.paid_amount,
        changed_by_name: creator ? `${creator.first_name} ${creator.middle_name || ''} ${creator.last_name}`.trim() : 'Unknown',
        parcel_number: landRecord.parcel_number,
        description: data.description,
        penalty_reason: data.penalty_reason,
        payer_id: data.payer_id
      }
    }, { transaction: t });
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

        
        const changes = {};
        Object.keys(paymentData).forEach((key) => {
          if (
            paymentToUpdate[key] !== paymentData[key] &&
            key !== "updatedAt" &&
            key !== "createdAt"
          ) {
            changes[key] = {
              from: paymentToUpdate[key],
              to: paymentData[key],
            };
          }
        });

        
        const updatePayload = {
          ...paymentData,
          updated_by: updater.id,
        };

        
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
