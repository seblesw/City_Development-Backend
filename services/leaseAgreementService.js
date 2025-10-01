const { LeaseAgreement, LandRecord, LeaseUser, LandPayment, sequelize,LEASE_STATUSES, LEASE_USER_TYPES,PAYMENT_TYPES} = require('../models');
const { Op } = require('sequelize');

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

    // Validate required fields
    if (!land_record_id) throw new Error('የመሬት መዝገብ መለያ መግለጽ አለበት።');
    if (!lessee || !lessee.name) throw new Error('የተከራይ ስም መግለጽ አለበት።');
    if (!leased_area) throw new Error('የተከራየ ስፋት መግለጽ አለበት።');
    if (!lease_start_date || !lease_end_date) throw new Error('የኪራይ መጀመሪያ እና መጨረሻ ቀን መግለጽ አለበት።');
    if (!user || !user.id) throw new Error('ፈጣሪ መለያ መግለጽ አለበት።');

    // Validate LandRecord
    const landRecord = await LandRecord.findOne({
      where: {
        id: land_record_id,
        property_owner_type: 'LAND_BANK',
        deletedAt: null,
      },
      transaction: t,
    });
    if (!landRecord) throw new Error('የመሬት ባንክ መዝገብ አልተገኘም።');

    // Validate leased_area
    const existingLeases = await LeaseAgreement.findAll({
      where: { land_record_id, deletedAt: null },
      transaction: t,
    });
    const totalLeasedArea = existingLeases.reduce((sum, lease) => sum + (lease.leased_area || 0), 0);
    if (totalLeasedArea + leased_area > landRecord.area) {
      throw new Error('የተከራየ ስፋት ከቀሪው ስፋት መብለጥ አዯችልም።');
    }
    // Create LeaseUser for lessee (type: LESSEE)
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

    // Create LeaseAgreement
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

    // Create LeaseUser for testimonials
    for (const testimonial of testimonials) {
      if (!testimonial.type || !Object.values(LEASE_USER_TYPES).includes(testimonial.type)) {
        throw new Error('የምስክር አይነት ትክክለኛ መሆን አለበት።');
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

    // Handle payment if provided
    let leasePayment = null;
    if (payment && (payment.total_amount > 0 || payment.paid_amount > 0)) {
      leasePayment = await LandPayment.create(
        {
          lease_agreement_id: leaseAgreement.id,
          land_record_id: land_record_id,
          payer_id: lesseeUser.id,
          payment_type:PAYMENT_TYPES.LEASE_PAYMENT,
          total_amount: payment.total_amount,
          paid_amount: payment.paid_amount,
          annual_payment: payment.annual_payment,
          initial_payment: payment.initial_payment,
          penality_amount: payment.penality_amount,
          penality_rate: payment.penality_rate,
          remaining_amount: payment.total_amount - payment.paid_amount,
          payment_date: payment.payment_date,
          created_by: user.id,
          updated_by: user.id,
        },
        { transaction: t }
      );

      // Update LeaseAgreement with payment_id
      await leaseAgreement.update(
        { payment_id: leasePayment.id },
        { transaction: t }
      );
    }

    // Update LandRecord available area (assume LandRecord has available_area field, default to area)
    await landRecord.update(
      { available_area: landRecord.available_area - leased_area },
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

module.exports = { createLeaseAgreementService };