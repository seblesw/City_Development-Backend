const { sequelize, LandPayment } = require("../models");
const { PAYMENT_STATUSES } = require("../models/LandPayment");

const createPayment = async (data, creatorId, transaction) => {
  const paymentData = {
    land_record_id: data.land_record_id,
    payment_type: data.payment_type,
    total_amount: data.total_amount,
    paid_amount: data.paid_amount,
    currency: data.currency || "ETB",
    payment_status: PAYMENT_STATUSES.PENDING,
    penalty_reason: data.penalty_reason || null,
    description: data.description || null,
    payer_id: data.payer_id,
    created_at: new Date(),
  };
  return await LandPayment.create(paymentData, { transaction });
};

const getPayment = async (id) => {
  const payment = await LandPayment.findByPk(id);
  if (!payment) throw new Error("ክፍያ አልተገኘም።");
  return payment;
};

const updatePayment = async (id, data, updaterId) => {
  const transaction = await sequelize.transaction();
  try {
    const payment = await LandPayment.findByPk(id, { transaction });
    if (!payment) throw new Error("ክፍያ አልተገኘም።");
    const updatedData = {
      ...data,
      updated_at: new Date(),
    };
    await payment.update(updatedData, { transaction });
    await transaction.commit();
    return payment;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const deletePayment = async (id, deleterId) => {
  const transaction = await sequelize.transaction();
  try {
    const payment = await LandPayment.findByPk(id, { transaction });
    if (!payment) throw new Error("ክፍያ አልተገኘም።");
    await payment.destroy({ transaction });
    await transaction.commit();
    return { message: "ክፍያ በተሳካ ሁኔታ ተሰርዟል።" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { createPayment, getPayment, updatePayment, deletePayment };