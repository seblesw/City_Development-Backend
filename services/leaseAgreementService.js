const {
  LeaseAgreement,
  LandRecord,
  AdministrativeUnit,
  LeaseUser,
  LandPayment,
  User,
  LEASE_STATUSES,
  LEASE_USER_TYPES,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
  sequelize,
  OWNERSHIP_TYPES,
} = require("../models");
const { Op } = require("sequelize");

const calculatePaymentStatus = (payment) => {
  const { total_amount, paid_amount } = payment;
  if (paid_amount === 0) return PAYMENT_STATUSES.PENDING;
  if (paid_amount >= total_amount) return PAYMENT_STATUSES.COMPLETED;
  if (paid_amount > 0 && paid_amount < total_amount)
    return PAYMENT_STATUSES.PARTIAL;
  return PAYMENT_STATUSES.PENDING;
};

const createLeaseAgreementService = async (data, files, user) => {
  const t = await sequelize.transaction();

  try {
    const {
      land_record_id,
      lessee,
      leased_area,
      lease_start_date,
      lease_end_date,
      lease_terms,
      testimonials = [],
      payment,
    } = data;

    if (!land_record_id) throw new Error("የመሬት መዝገብ መለያ መግለጽ አለበት።");
    if (!lessee || !lessee.name) throw new Error("የተከራይ ስም መግለጽ አለበት።");
    if (!leased_area) throw new Error("የተከራየ ስፋት መግለጽ አለበት።");
    if (!lease_start_date || !lease_end_date)
      throw new Error("የኪራይ መጀመሪያ እና መጨረሻ ቀን መግለጽ አለበት።");
    if (!user || !user.id) throw new Error("ፈጣሪ መለያ መግለጽ አለበት።");
    if (!user.administrative_unit_id)
      throw new Error("የአስተዳደር ክፍል መለያ መግለጽ አለበት።");

    const landRecord = await LandRecord.findOne({
      where: {
        id: land_record_id,
        ownership_type: OWNERSHIP_TYPES.MERET_BANK,
        deletedAt: null,
      },
      transaction: t,
    });
    if (!landRecord) throw new Error("የመሬት ባንክ መዝገብ አልተገኘም።");

    const existingLeases = await LeaseAgreement.findAll({
      where: { land_record_id, deletedAt: null },
      transaction: t,
    });
    const totalLeasedArea = existingLeases.reduce(
      (sum, lease) => sum + (lease.leased_area || 0),
      0
    );
    if (totalLeasedArea + leased_area > landRecord.area) {
      throw new Error("የተከራየ ስፋት ከቀሪው ስፋት መብለጥ አይችልም።");
    }

    const lesseeUser = await LeaseUser.create(
      {
        type: LEASE_USER_TYPES.LESSEE,
        name: lessee.name,
        phone: lessee.phone,
        email: lessee.email,
        address: lessee.address,
        national_id: lessee.national_id,
      },
      { transaction: t }
    );

    const leaseAgreement = await LeaseAgreement.create(
      {
        land_record_id,
        administrative_unit_id: landRecord.administrative_unit_id,
        lessee_id: lesseeUser.id,
        leased_area,
        lease_start_date,
        lease_end_date,
        lease_terms,
        status: LEASE_STATUSES.ACTIVE,
        created_by: user.id,
        updated_by: user.id,
      },
      { transaction: t }
    );

    for (const testimonial of testimonials) {
      if (
        !testimonial.type ||
        !Object.values(LEASE_USER_TYPES).includes(testimonial.type)
      ) {
        throw new Error("የምስክር አይነት ትክክለኛ መሆን አለበት።");
      }

      await LeaseUser.create(
        {
          lease_agreement_id: leaseAgreement.id,
          type: testimonial.type,
          name: testimonial.name,
          phone: testimonial.phone,
          email: testimonial.email,
          address: testimonial.address,
          national_id: testimonial.national_id,
        },
        { transaction: t }
      );
    }

    let leasePayment = null;
    if (payment && (payment.total_amount > 0 || payment.paid_amount > 0)) {
      if (!payment.total_amount || payment.total_amount < 0) {
        throw new Error("የክፍያ ገንዘብ ትክክለኛ መሆን አለበት።");
      }
      if (!payment.paid_amount || payment.paid_amount < 0) {
        throw new Error("የተከፈለ ገንዘብ ትክክለኛ መሆን አለበት።");
      }
      leasePayment = await LandPayment.create(
        {
          lease_agreement_id: leaseAgreement.id,
          land_record_id: land_record_id,
          payer_id: lesseeUser.id,
          payment_type: PAYMENT_TYPES.LEASE_PAYMENT,
          total_amount: payment.total_amount,
          paid_amount: payment.paid_amount,
          annual_payment: payment.annual_payment,
          initial_payment: payment.initial_payment,
          remaining_amount: payment.total_amount - payment.paid_amount,
          payment_date: payment.payment_date,
          created_by: user.id,
          updated_by: user.id,
          payment_status: calculatePaymentStatus(payment),
        },
        { transaction: t }
      );

      await leaseAgreement.update(
        { payment_id: leasePayment.id },
        { transaction: t }
      );
    }

    await landRecord.update(
      {
        available_area:
          (landRecord.available_area || landRecord.area) - leased_area,
      },
      { transaction: t }
    );

    await t.commit();

    return {
      leaseAgreement: leaseAgreement.toJSON(),
      leasePayment: leasePayment?.toJSON(),
    };
  } catch (error) {
    await t.rollback();
    throw new Error(`የኪራይ ስምምነት መፍጠር ስህተት: ${error.message}`);
  }
};

const getAllLeaseAgreementsService = async (user, queryParams = {}) => {
  if (!user || !user.administrative_unit_id) {
    throw new Error("የአስተዳደር ክፍል መለያ መግለጽ አለበት።");
  }

  const { page = 1, limit = 10, status, startDate, endDate } = queryParams;
  const offset = (page - 1) * limit;

  const where = {
    administrative_unit_id: user.administrative_unit_id,
    deletedAt: null,
  };

  if (status && Object.values(LEASE_STATUSES).includes(status)) {
    where.status = status;
  }
  if (startDate) {
    where.lease_start_date = { [Op.gte]: new Date(startDate) };
  }
  if (endDate) {
    where.lease_end_date = { [Op.lte]: new Date(endDate) };
  }

  const leaseAgreements = await LeaseAgreement.findAndCountAll({
    where,
    include: [
      { model: LandRecord, as: "landRecord" },
      { model: AdministrativeUnit, as: "leaser" },
      { model: LeaseUser, as: "lessee" },
      {
        model: LeaseUser,
        as: "testimonials",
        where: {
          type: [
            LEASE_USER_TYPES.LEASER_TESTIMONIAL,
            LEASE_USER_TYPES.LESSEE_TESTIMONIAL,
          ],
        },
        required: false,
      },
      { model: User, as: "creator" },
      { model: User, as: "updater" },
      { model: LandPayment, as: "payment" },
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
  });

  return {
    data: leaseAgreements.rows.map((agreement) => agreement.toJSON()),
    total: leaseAgreements.count,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(leaseAgreements.count / limit),
  };
};

const getLeaseAgreementsByLandRecordIdService = async (
  landRecordId,
  user,
  queryParams = {}
) => {
  if (!user || !user.administrative_unit_id) {
    throw new Error("የአስተዳደር ክፍል መለያ መግለጽ አለበት።");
  }
  if (!landRecordId || isNaN(landRecordId)) {
    throw new Error("የመሬት መዝገብ መለያ ትክክለኛ መሆን አለበት።");
  }

  const { page = 1, limit = 10, status, startDate, endDate } = queryParams;
  const offset = (page - 1) * limit;

  const where = {
    land_record_id: landRecordId,
    administrative_unit_id: user.administrative_unit_id,
    deletedAt: null,
  };

  if (status && Object.values(LEASE_STATUSES).includes(status)) {
    where.status = status;
  }
  if (startDate) {
    where.lease_start_date = { [Op.gte]: new Date(startDate) };
  }
  if (endDate) {
    where.lease_end_date = { [Op.lte]: new Date(endDate) };
  }

  const leaseAgreements = await LeaseAgreement.findAndCountAll({
    where,
    include: [
      { model: LandRecord, as: "landRecord" },
      { model: AdministrativeUnit, as: "leaser" },
      { model: LeaseUser, as: "lessee" },
      {
        model: LeaseUser,
        as: "testimonials",
        where: {
          type: [
            LEASE_USER_TYPES.LEASER_TESTIMONIAL,
            LEASE_USER_TYPES.LESSEE_TESTIMONIAL,
          ],
        },
        required: false,
      },
      { model: User, as: "creator" },
      { model: User, as: "updater" },
      { model: LandPayment, as: "payment" },
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [["createdAt", "DESC"]],
  });

  return {
    data: leaseAgreements.rows.map((agreement) => agreement.toJSON()),
    total: leaseAgreements.count,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(leaseAgreements.count / limit),
  };
};

module.exports = {
  createLeaseAgreementService,
  getAllLeaseAgreementsService,
  getLeaseAgreementsByLandRecordIdService,
};
