const { LandPayment, PaymentSchedule, LandRecord, User, sequelize,PAYMENT_TYPES, PAYMENT_STATUSES  } = require('../models');
const {Op} = require('sequelize');
const createTaxSchedules = async (dueDate, description = '') => {
  const landRecords = await LandRecord.findAll({
    include: [
      {
        model: User,
        as: 'owners',
        through: { attributes: [] },
      },
    ],
    limit:5
  });
  if (!landRecords.length) {
    throw new Error('የመሬት መዝገብ አልተገኘም');
  }

  const schedules = [];
  for (const landRecord of landRecords) {
    if (!landRecord.owners || !landRecord.owners.length) {
      throw new Error(`የ መዝገብ ቁጥር ${landRecord.id} ለመሬት ባለቤት አልተገኘም`);
    }
    const firstOwner = landRecord.owners[0];
    const expectedAmount = Number((landRecord.area * 3).toFixed(2));

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: PAYMENT_TYPES.TAX,
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: PAYMENT_STATUSES.PENDING,
      currency: 'ETB',
      payer_id: firstOwner.id,
    });

    const schedule = await PaymentSchedule.create({
      land_payment_id: landPayment.id,
      expected_amount: expectedAmount,
      due_date: new Date(dueDate),
      grace_period_days: 15,
      penalty_rate: 0.07,
      is_active: true,
      description,
    });

    schedules.push(schedule);
  }

  return schedules;
};

const createLeaseSchedules = async (dueDate, description = '') => {
  const landRecords = await LandRecord.findAll({
    where: { ownership_type: 'LEASE' },
    include: [
      {
        model: User,
        as: 'owners',
        through: { attributes: [] },
      },
    ],
  });
  if (!landRecords.length) {
    throw new Error('በሊዝ ይዞታ የተያዘ የመሬት መዝገብ አልተገኘም');
  }

  const schedules = [];
  for (const landRecord of landRecords) {
    if (!landRecord.owners || !landRecord.owners.length) {
      throw new Error(`የ መዝገብ ቁጥር ${landRecord.id} ለመሬት ባለቤት አልተገኘም`);
    }
    const firstOwner = landRecord.owners[0];
    const leaseRate = 5;
    const expectedAmount = Number((landRecord.area * leaseRate).toFixed(2));

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: PAYMENT_TYPES.LEASE_PAYMENT,
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: PAYMENT_STATUSES.PENDING,
      currency: 'ETB',
      payer_id: firstOwner.id,
    });

    const schedule = await PaymentSchedule.create({
      land_payment_id: landPayment.id,
      expected_amount: expectedAmount,
      due_date: new Date(dueDate),
      grace_period_days: 15,
      penalty_rate: 0.07,
      is_active: true,
      description,
    });

    schedules.push(schedule);
  }

  return schedules;
};

const checkOverdueSchedules = async (testDate = null) => {
  const today = testDate ? new Date(testDate) : new Date();
  
  
  
  const maxDueDate = new Date(today);
  maxDueDate.setDate(maxDueDate.getDate() - 15); 
  
  const schedules = await PaymentSchedule.findAll({
    where: {
      is_active: true,
      due_date: { [Op.lt]: maxDueDate },
    },
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            include: [{ model: User, as: 'owners', through: { attributes: [] } }],
          },
        ],
      },
    ],
  });
  

  const penaltySchedules = [];
  const transaction = await sequelize.transaction();
  try {
    for (const schedule of schedules) {
      const existingPenalty = await PaymentSchedule.findOne({
        where: { related_schedule_id: schedule.id, is_active: true },
        transaction,
      });
      if (existingPenalty) {
        
        continue;
      }

      const graceEnd = new Date(schedule.due_date);
      graceEnd.setDate(graceEnd.getDate() + schedule.grace_period_days);
      

      const landPayment = schedule.landPayment;
      const landRecord = landPayment.landRecord;
      const firstOwner = landRecord.owners[0];
      if (!firstOwner) {
        
        continue;
      }

      const remaining = Number(schedule.expected_amount) - Number(landPayment.paid_amount);
      if (remaining <= 0) {
        
        continue;
      }

      const overdueDays = Math.floor((today - graceEnd) / (1000 * 60 * 60 * 24));
      const overdueMonths = Math.max(1, Math.floor(overdueDays / 30));
      const penalty = Number((remaining * schedule.penalty_rate * overdueMonths).toFixed(2));
      

      if (penalty > 0) {
        const penaltyPayment = await LandPayment.create({
          land_record_id: landRecord.id,
          payment_type: PAYMENT_TYPES.PENALTY,
          total_amount: 0,
          paid_amount: 0,
          remaining_amount: 0,
          penality_amount: penalty,
          penality_rate: schedule.penalty_rate,
          penalty_reason: `Overdue schedule ID ${schedule.id} (${landPayment.payment_type})`,
          payment_status: PAYMENT_STATUSES.PENDING,
          currency: 'ETB',
          payer_id: firstOwner.id,
        }, { transaction });

        const penaltySchedule = await PaymentSchedule.create({
          land_payment_id: penaltyPayment.id,
          expected_amount: penalty,
          due_date: new Date(),
          grace_period_days: 15,
          penalty_rate: 0.07,
          is_active: true,
          related_schedule_id: schedule.id,
          description: `ቅጣት ለመዘግየት ${landPayment.payment_type}`,
        }, { transaction });

        penaltySchedules.push(penaltySchedule);
      }
    }

    await transaction.commit();
    
    return penaltySchedules;
  } catch (error) {
    await transaction.rollback();
    
    throw error;
  }
};

module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
  checkOverdueSchedules,
};