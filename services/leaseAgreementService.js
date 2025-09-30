const { LeaseAgreement, LandRecord, PROPERTY_OWNER_TYPE, LEASE_STATUSES } = require('../models');
const { Op } = require('sequelize');
// const { calculatePaymentStatus } = require('./paymentUtils');

const createLeaseAgreementService = async (data, files, user) => {
    const t = await sequelize.transaction();

    try {
        const { land_record_id, lessee_id, leased_area, lease_start_date, lease_end_date, lease_terms, annual_lease_amount, initial_lease_amount, leaser_testimonial, lessee_testimonial, payment } = data;

        // Validate required fields
        if (!land_record_id || !lessee_id || !leased_area || !lease_start_date || !lease_end_date) {
            throw new Error("የግዴታ መረጃዎች ያስፈልጋሉ።");
        }

        // Validate LandRecord
        const landRecord = await LandRecord.findOne({
            where: {
                id: land_record_id,
                property_owner_type: PROPERTY_OWNER_TYPE.LAND_BANK,
                deletedAt: null,
            },
            transaction: t,
        });

        if (!landRecord) {
            throw new Error("የመሬት ባንክ መዝገብ አልተገኘም።");
        }

        // Validate leased_area
        const existingLeases = await LeaseAgreement.findAll({
            where: { land_record_id: land_record_id, deletedAt: null },
            transaction: t,
        });

        const totalLeasedArea = existingLeases.reduce((sum, lease) => sum + lease.leased_area, 0);
        if (totalLeasedArea + leased_area > landRecord.area) {
            throw new Error("የተከራየ ስፋት ከቀሪው ስፋት መብለጥ አይችልም።");
        }

        // Create lease agreement
        const leaseAgreement = await LeaseAgreement.create(
            {
                land_record_id,
                administrative_unit_id: landRecord.administrative_unit_id,
                lessee_id,
                leased_area,
                lease_start_date,
                lease_end_date,
                lease_terms,
                annual_lease_amount,
                initial_lease_amount,
                leaser_testimonial,
                lessee_testimonial,
                status: LEASE_STATUSES.ACTIVE,
                created_by: user.id,
            },
            { transaction: t }
        );

        // Handle payment if provided
        let leasePayment = null;
        if (payment && (payment.total_amount > 0 || payment.paid_amount > 0)) {
            leasePayment = await landPaymentService.createLandPaymentService(
                {
                    ...payment,
                    land_record_id: land_record_id,
                    payer_id: lessee_id,
                    created_by: user.id,
                    // payment_status: calculatePaymentStatus(payment),
                },
                { transaction: t }
            );
        }

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

const getLeaseAgreementService = async (id) => {
    const leaseAgreement = await LeaseAgreement.findOne({
        where: { id },
        include: [
            { model: LandRecord, as: 'landRecord' },
            { model: AdministrativeUnit, as: 'leaser' },
            { model: User, as: 'lessee' },
            { model: User, as: 'leaserTestimonials' },
            { model: User, as: 'lesseeTestimonials' },
            { model: User, as: 'creator' },
            { model: User, as: 'updater' },
        ],
    });

    if (!leaseAgreement) {
        throw new Error("የኪራይ ስምምነት አልተገኘም።");
    }

    return leaseAgreement.toJSON();
};

const getLeasedAreaReportService = async (landRecordId) => {
    const leases = await LeaseAgreement.findAll({
        where: {
            land_record_id: landRecordId,
            status: { [Op.ne]: LEASE_STATUSES.TERMINATED },
        },
    });

    const totalLeasedArea = leases.reduce((sum, lease) => sum + lease.leased_area, 0);
    const landRecord = await LandRecord.findByPk(landRecordId);

    if (!landRecord) {
        throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    return {
        totalLeasedArea,
        remainingArea: landRecord.area - totalLeasedArea,
        leases: leases.map(lease => lease.toJSON()),
    };
};

module.exports = {
    createLeaseAgreementService,
    getLeaseAgreementService,
    getLeasedAreaReportService
};