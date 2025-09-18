const { LandPayment, PaymentSchedule, LandRecord, User } = require("../models");

const createTaxSchedules = async (dueDate, description = "") => {
  const landRecords = await LandRecord.findAll({
    include: [
      {
       model: User,
        as: "owners",
        through: { attributes: [] },
      },
    ],
  });
  if (!landRecords.length) {
    throw new Error("የመሬት መዝገብ አልተገኘም");
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
      payment_type: "የግብር ክፍያ", 
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: "በመጠባበቅ ላይ", 
      currency: "ETB",
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

const createLeaseSchedules = async (dueDate, description = "") => {
  const landRecords = await LandRecord.findAll({
    where: { ownership_type: "LEASE" },
    include: [
      {
       model: User,
        as: "owners",
        through: { attributes: [] },
      },
    ],
  });
  if (!landRecords.length) {
    throw new Error("በሊዝ ይዞታ የተያዘ የመሬት መዝገብ አልተገኘም");
  }

  const schedules = [];
  for (const landRecord of landRecords) {
    if (!landRecord.owners || !landRecord.owners.length) {
      throw new Error(`No owner found for LandRecord ID ${landRecord.id}`);
    }
    const firstOwner = landRecord.owners[0];
    const leaseRate = 5; 
    const expectedAmount = landRecord.area * leaseRate; 

    const landPayment = await LandPayment.create({
      land_record_id: landRecord.id,
      payment_type: "የሊዝ ክፍያ", 
      total_amount: 0,
      paid_amount: 0,
      remaining_amount: 0,
      payment_status: "በመጠባበቅ ላይ",
      currency: "ETB",
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

module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
};
