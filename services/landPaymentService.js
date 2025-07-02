const { sequelize, LandPayment } = require("../models");

const createPayment = async (data, creatorId, options = {}) => {
  const { transaction } = options;
  try {
    if (!data.land_record_id || !data.payment_type || !data.total_amount || !data.paid_amount || !data.payer_id) {
      throw new Error("የግዴታ መረጃዎች (land_record_id, payment_type, total_amount, paid_amount, payer_id) መግለጽ አለባቸው።");
    }
    const payment = await LandPayment.create(
      {
        land_record_id: data.land_record_id,
        payment_type: data.payment_type,
        total_amount: data.total_amount,
        paid_amount: data.paid_amount,
        currency: data.currency || "ETB",
        payment_status: data.payment_status || "በመጠባበቅ ላይ",
        penalty_reason: data.penalty_reason || null,
        description: data.description || null,
        payer_id: data.payer_id,
      },
      { transaction }
    );
    return payment;
  } catch (error) {
    throw new Error(`የክፍያ መፍጠር ስህተት: ${error.message}`);
  }
};

const getPaymentById = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const payment = await LandPayment.findByPk(id, {
      include: [
        { model: require("../models").LandRecord, as: "landRecord", attributes: ["id", "parcel_number"] },
        { model: require("../models").User, as: "payer", attributes: ["id", "first_name", "last_name"] },
      ],
      transaction,
    });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ክፍያ አልተገኘም።`);
    }
    return payment;
  } catch (error) {
    throw new Error(`የክፍያ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

const updatePayment = async (id, data, updaterId, options = {}) => {
  const { transaction } = options;
  try {
    const payment = await LandPayment.findByPk(id, { transaction });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ክፍያ አልተገኘም።`);
    }
    const updateData = {};
    const updatableFields = [
      "payment_type",
      "total_amount",
      "paid_amount",
      "currency",
      "payment_status",
      "penalty_reason",
      "description",
      "payer_id",
    ];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }
    updateData.updated_at = new Date();
    await payment.update(updateData, { transaction });
    return payment;
  } catch (error) {
    throw new Error(`የክፍያ መቀየር ስህተት: ${error.message}`);
  }
};

const deletePayment = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  try {
    const payment = await LandPayment.findByPk(id, { transaction });
    if (!payment) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ክፍ�ヤ አልተገኘም።`);
    }
    await payment.destroy({ transaction });
    return { message: `መለያ ቁጥር ${id} ያለው ክፍያ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    throw new Error(`የክፍያ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createPayment,
  getPaymentById,
  updatePayment,
  deletePayment,
};