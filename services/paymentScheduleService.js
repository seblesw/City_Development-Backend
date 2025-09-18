const { LandPayment, PaymentSchedule, LandRecord, User } = require('../models');

const createTaxSchedules = async (dueDate, description = '') => {
  const landRecords = await LandRecord.findAll({
    include: [
      {
        model: User,
        as: 'owners',
        through: { attributes: [] },
      },
    ],
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
    const expectedAmount = landRecord.area * 3;

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: 'የግብር ክፍያ',
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: 'በመጠባበቅ ላይ',
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
    const expectedAmount = landRecord.area * leaseRate;

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: 'የሊዝ ክፍያ',
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: 'በመጠባበቅ ላይ',
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

const checkOverdueSchedules = async () => {
  const today = new Date();
  const schedules = await PaymentSchedule.findAll({
    where: { is_active: true },
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
  for (const schedule of schedules) {
    const graceEnd = new Date(schedule.due_date);
    graceEnd.setDate(graceEnd.getDate() + schedule.grace_period_days);
    if (graceEnd < today) {
      const landPayment = schedule.landPayment;
      const landRecord = landPayment.landRecord;
      const firstOwner = landRecord.owners[0];
      if (!firstOwner) {
        throw new Error(`የ መዝገብ ቁጥር ${landRecord.id} ለመሬት ባለቤት አልተገኘም`);
      }

      const remaining = schedule.expected_amount - landPayment.paid_amount;
      const overdueDays = Math.floor((today - graceEnd) / (1000 * 60 * 60 * 24));
      const overdueMonths = Math.max(1, Math.floor(overdueDays / 30)); // At least 1 month
      const penalty = Number((remaining * schedule.penalty_rate * overdueMonths).toFixed(2));

      if (penalty > 0) {
        const penaltyPayment = await LandPayment.create({
          land_record_id: landRecord.id,
          payment_type: 'ቅጣት',
          total_amount: 0,
          paid_amount: 0,
          remaining_amount: 0,
          payment_status: 'በመጠባበቅ ላይ',
          currency: 'ETB',
          payer_id: firstOwner.id,
        });

        const penaltySchedule = await PaymentSchedule.create({
          land_payment_id: penaltyPayment.id,
          expected_amount: penalty,
          due_date: new Date(),
          grace_period_days: 15,
          penalty_rate: 0.07,
          is_active: true,
          related_schedule_id: schedule.id,
          description: `ቅጣት ለመዘግየት ${landPayment.payment_type}`,
        });

        penaltySchedules.push(penaltySchedule);
      }
    }
  }

  return penaltySchedules;
};

module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
  checkOverdueSchedules,
};