const { LandPayment, PaymentSchedule, LandRecord } = require('../models');

const createTaxSchedules = async (dueDate, description = '') => {
  const landRecords = await LandRecord.findAll();
  if (!landRecords.length) {
    throw new Error('No LandRecords found');
  }

  const schedules = [];
  for (const landRecord of landRecords) {
    const expectedAmount = landRecord.area * 3; 

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: 'የግብር ክፍያ', 
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: 'በመጠባበቅ ላይ', 
      currency: 'ETB',
    });

    const schedule = await PaymentSchedule.create({
      land_payment_id: landPayment.id,
      expected_amount: expectedAmount,
      due_date: new Date(dueDate),
      grace_period_days: 30,
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
  });
  if (!landRecords.length) {
    throw new Error('No LEASE LandRecords found');
  }

  const schedules = [];
  for (const landRecord of landRecords) {
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
    });

    const schedule = await PaymentSchedule.create({
      land_payment_id: landPayment.id,
      expected_amount: expectedAmount,
      due_date: new Date(dueDate),
      grace_period_days: 30,
      penalty_rate: 0.07,
      is_active: true,
      description,
    });

    schedules.push(schedule);
  }

  return schedules;
};

module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
};