const { LandPayment, PaymentSchedule, LandRecord, User, sequelize,PAYMENT_TYPES, PAYMENT_STATUSES, LAND_PREPARATION, LAND_USE_TYPES, AdministrativeUnit  } = require('../models');
const {Op} = require('sequelize');

const createLeaseSchedules = async (dueDate, description = '', userAdminUnitId) => {
  // Constants
  const LEASE_CONSTANTS = {
    GRACE_PERIOD_DAYS: 15,
    PENALTY_RATE: 0.07,
    CURRENCY: 'ETB'
  };

  // First, verify the user's administrative unit exists
  const userAdminUnit = await AdministrativeUnit.findByPk(userAdminUnitId);
  if (!userAdminUnit) {
    throw new Error('የተጠቃሚው አስተዳደራዊ ክፍል አልተገኘም');
  }

  // Get land payments directly for lease payments in the user's admin unit with annual_payment > 0
  const landPayments = await LandPayment.findAll({
    where: {
      payment_type: PAYMENT_TYPES.LEASE_PAYMENT,
      annual_payment: { 
        [Op.gt]: 0 
      }
    },
    include: [
      {
        model: LandRecord,
        as: 'landRecord',
        where: {
          administrative_unit_id: userAdminUnitId,
          land_preparation: 'ሊዝ' 
        },
        required: true,
        include: [
          {
            model: User,
            as: 'owners',
            through: { attributes: [] },
            required: true,
          },
          {
            model: AdministrativeUnit,
            as: 'administrativeUnit',
            attributes: ['id', 'unit_level', 'name']
          }
        ]
      }
    ]
  });

  if (!landPayments.length) {
    throw new Error(`በ${userAdminUnit.name} አስተዳደራዊ ክፍል ውስጥ የሊዝ ክፍያዎች ከዜሮ በላይ ዓመታዊ ክፍያ ያላቸው አልተገኙም`);
  }

  console.log(`Found ${landPayments.length} lease payments with annual payment > 0 in ${userAdminUnit.name}`);

  const schedules = [];
  let processedCount = 0;
  let skippedCount = 0;

  for (const landPayment of landPayments) {
    try {
      const landRecord = landPayment.landRecord;
      const firstOwner = landRecord.owners[0];
      
      // Use the annual_payment from the existing land payment
      const expectedAmount = landPayment.annual_payment;

      // Double-check that annual_payment is valid
      if (!expectedAmount || expectedAmount <= 0) {
        console.warn(`⏭️  Land Payment ${landPayment.id}: Invalid annual payment (${expectedAmount}), skipping`);
        skippedCount++;
        continue;
      }

      // Check if there's already an active schedule for this payment to avoid duplicates
      const existingSchedule = await PaymentSchedule.findOne({
        where: {
          land_payment_id: landPayment.id,
          is_active: true,
          due_date: new Date(dueDate) 
        }
      });

      if (existingSchedule) {
        console.warn(`⏭️  Land Payment ${landPayment.id}: Active schedule already exists for due date ${dueDate}, skipping`);
        skippedCount++;
        continue;
      }

      // Update the land payment status to PENDING
      await LandPayment.update({
        payment_status: PAYMENT_STATUSES.PENDING,
        last_updated: new Date()
      }, {
        where: { id: landPayment.id }
      });

      // Create PaymentSchedule record linked to existing land payment
      const schedule = await PaymentSchedule.create({
        land_payment_id: landPayment.id,
        expected_amount: expectedAmount,
        due_date: new Date(dueDate),
        grace_period_days: LEASE_CONSTANTS.GRACE_PERIOD_DAYS,
        penalty_rate: LEASE_CONSTANTS.PENALTY_RATE,
        is_active: true,
        description: description || `ዓመታዊ የሊዝ ክፍያ - ${userAdminUnit.name} - ዓመታዊ ክፍያ ${expectedAmount} ETB`,
        calculation_metadata: {
          source: 'existing_land_payment_annual',
          annualPayment: expectedAmount,
          landPreparation: landRecord.land_preparation,
          administrativeUnit: {
            id: userAdminUnit.id,
            name: userAdminUnit.name,
            level: userAdminUnit.unit_level
          },
          createdByAdminUnit: userAdminUnitId,
          landRecordId: landRecord.id,
          originalLandPaymentId: landPayment.id,
          paymentDetails: {
            initial_payment: landPayment.initial_payment,
            total_amount: landPayment.total_amount,
            paid_amount: landPayment.paid_amount
          }
        }
      });

      schedules.push(schedule);
      processedCount++;
      
      console.log(`✅ Created lease schedule for land payment ${landPayment.id}: ETB ${expectedAmount}`);

    } catch (error) {
      console.error(`❌ Error creating lease schedule for land payment ${landPayment.id}:`, error.message);
      skippedCount++;
      continue;
    }
  }

  console.log(`Lease schedule creation completed:
    - Total valid lease payments: ${landPayments.length}
    - Successfully processed: ${processedCount}
    - Skipped: ${skippedCount}
    - Admin Unit: ${userAdminUnit.name}`);

  if (schedules.length === 0) {
    throw new Error(`በ${userAdminUnit.name} አስተዳደራዊ ክፍል ውስጥ ምንም የሊዝ ክፍያ መርሃ ግብር አልተፈጠረም`);
  }

  return schedules;
};

const createTaxSchedules = async (dueDate, description = '', userAdminUnitId) => {
  // Constants
  const TAX_CONSTANTS = {
    GRACE_PERIOD_DAYS: 15,
    PENALTY_RATE: 0.07,
    CURRENCY: 'ETB',
    LAND_PREPARATION_EXISTING: "ነባር"
  };

  // Define tax rate tables per square meter (ETB)
  const TAX_RATES = {
    "መኖሪያ": {
      1: { 1: 4.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 1.5 },
      2: { 1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5, 5: 1.0 },
      3: { 1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5, 5: 1.0 },
      4: { 1: 2.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 1.0 },
      5: { 1: 2.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 1.0 },
      6: { 1: 2.0, 2: 2.0, 3: 1.0, 4: 1.0, 5: 1.0 }
    },
    "ንግድ": {
      1: { 1: 8.0, 2: 6.0, 3: 5.0, 4: 4.0, 5: 3.0 },
      2: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.0 },
      3: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.0 },
      4: { 1: 4.0, 2: 4.0, 3: 3.0, 4: 2.0, 5: 2.0 },
      5: { 1: 4.0, 2: 4.0, 3: 3.0, 4: 2.0, 5: 2.0 },
      6: { 1: 4.0, 2: 4.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    "ኢንዱስትሪ": {
      1: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.5 },
      2: { 1: 5.0, 2: 4.0, 3: 3.0, 4: 2.5, 5: 2.0 },
      3: { 1: 5.0, 2: 4.0, 3: 3.0, 4: 2.5, 5: 2.0 },
      4: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      5: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      6: { 1: 3.0, 2: 3.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    "መንግስታዊ ተቋማት": {
      1: { 1: 2.0, 2: 1.5, 3: 1.0, 4: 0.8, 5: 0.5 },
      2: { 1: 1.5, 2: 1.0, 3: 0.8, 4: 0.5, 5: 0.3 },
      3: { 1: 1.5, 2: 1.0, 3: 0.8, 4: 0.5, 5: 0.3 },
      4: { 1: 1.0, 2: 1.0, 3: 0.5, 4: 0.3, 5: 0.3 },
      5: { 1: 1.0, 2: 1.0, 3: 0.5, 4: 0.3, 5: 0.3 },
      6: { 1: 1.0, 2: 1.0, 3: 0.3, 4: 0.3, 5: 0.3 }
    },
    "ማህበራዊ አገልግሎት": {
      1: { 1: 5.0, 2: 4.0, 3: 3.5, 4: 3.0, 5: 2.5 },
      2: { 1: 4.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 2.0 },
      3: { 1: 4.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 2.0 },
      4: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      5: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      6: { 1: 3.0, 2: 3.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    "ከተማ ግብርና": {
      1: { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.5, 5: 0.4 },
      2: { 1: 0.8, 2: 0.6, 3: 0.5, 4: 0.4, 5: 0.3 },
      3: { 1: 0.8, 2: 0.6, 3: 0.5, 4: 0.4, 5: 0.3 },
      4: { 1: 0.6, 2: 0.6, 3: 0.4, 4: 0.3, 5: 0.3 },
      5: { 1: 0.6, 2: 0.6, 3: 0.4, 4: 0.3, 5: 0.3 },
      6: { 1: 0.6, 2: 0.6, 3: 0.3, 4: 0.3, 5: 0.3 }
    }
  };

  // Helper function to get effective unit level for rate grouping
  const getEffectiveUnitLevel = (unitLevel) => {
    switch (unitLevel) {
      case 1:
        return 1;
      case 2:
      case 3:
        return 2;
      case 4:
      case 5:
        return 4;
      case 6:
        return 6;
      default:
        throw new Error(`Invalid unit level: ${unitLevel}`);
    }
  };

  // Helper function to calculate amount per area
  const getAmountPerArea = (landRecord) => {
    const { land_use, land_level, administrativeUnit } = landRecord;

    if (!administrativeUnit) {
      throw new Error('Administrative unit information is required');
    }

    const unitLevel = administrativeUnit.unit_level;
    const landUseRates = TAX_RATES[land_use];

    if (!landUseRates) {
      throw new Error(`No tax rates defined for land use: ${land_use}`);
    }

    // Handle unit level grouping
    const effectiveUnitLevel = getEffectiveUnitLevel(unitLevel);
    const levelRates = landUseRates[effectiveUnitLevel];

    if (!levelRates) {
      throw new Error(`No tax rates for unit level ${effectiveUnitLevel} and land use ${land_use}`);
    }

    const amount = levelRates[land_level];

    if (amount === undefined) {
      throw new Error(`No tax rate for land level ${land_level}, unit level ${effectiveUnitLevel}, land use ${land_use}`);
    }

    return amount;
  };

  // Helper function to calculate expected amount
  const calculateExpectedAmount = (landRecord) => {
    // Only calculate for "ነባር" (existing) land preparations
    if (landRecord.land_preparation !== TAX_CONSTANTS.LAND_PREPARATION_EXISTING) {
      return 0;
    }

    const amountPerArea = getAmountPerArea(landRecord);
    const annualTax = landRecord.area * amountPerArea;
    const result = Number(annualTax.toFixed(2));
    return result;
  };

  // Helper function to handle land record errors
  const handleLandRecordError = (landRecordId, error, operation) => {
    console.error(`Failed to ${operation} for land record ${landRecordId}:`, error.message);
  };

  // Start processing
  console.log(`Starting tax schedule creation for admin unit: ${userAdminUnitId}`);

  // First, verify the user's administrative unit exists and get its details
  const userAdminUnit = await AdministrativeUnit.findByPk(userAdminUnitId);
  if (!userAdminUnit) {
    throw new Error('የተጠቃሚው አስተዳደራዊ ክፍል አልተገኘም');
  }

  // Get land records only from the user's administrative unit
  const landRecords = await LandRecord.findAll({
    where: {
      administrative_unit_id: userAdminUnitId
    },
    include: [
      {
        model: User,
        as: 'owners',
        through: { attributes: [] },
      },
      {
        model: AdministrativeUnit,
        as: 'administrativeUnit',
        attributes: ['id', 'unit_level', 'name']
      }
    ],
  });

  if (!landRecords.length) {
    throw new Error(`በ${userAdminUnit.name} አስተዳደራዊ ክፍል ውስጥ የመሬት መዝገብ አልተገኘም`);
  }

  console.log(`Found ${landRecords.length} land records in ${userAdminUnit.name}`);

  const schedules = [];
  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Process each land record
  for (const landRecord of landRecords) {
    try {
      // Skip records without owners
      if (!landRecord.owners || !landRecord.owners.length) {
        console.warn(`⏭️  Record ${landRecord.id}: No owner, skipping`);
        skippedCount++;
        continue;
      }

      // Double-check admin unit match (should already be filtered by query)
      if (landRecord.administrative_unit_id !== userAdminUnitId) {
        console.warn(`⏭️  Record ${landRecord.id}: Admin unit mismatch, skipping`);
        skippedCount++;
        continue;
      }

      if (!landRecord.administrativeUnit) {
        console.warn(`⏭️  Record ${landRecord.id}: No administrative unit, skipping`);
        skippedCount++;
        continue;
      }

      const firstOwner = landRecord.owners[0];

      // Calculate expected amount using the robust calculation
      const expectedAmount = calculateExpectedAmount(landRecord);

      // Skip if no tax is applicable (non-existing land preparation)
      if (expectedAmount <= 0) {
        console.log(`⏭️  Record ${landRecord.id}: No tax applicable (land preparation: ${landRecord.land_preparation}), skipping`);
        skippedCount++;
        continue;
      }

      const amountPerArea = getAmountPerArea(landRecord);

      // Create LandPayment record
      const landPayment = await LandPayment.create({
        land_record_id: landRecord.id,
        payment_type: PAYMENT_TYPES.TAX,
        total_amount: expectedAmount,
        paid_amount: 0,
        remaining_amount: expectedAmount,
        payment_status: PAYMENT_STATUSES.PENDING,
        currency: TAX_CONSTANTS.CURRENCY,
        payer_id: firstOwner.id,
        calculation_details: {
          area: landRecord.area,
          landUse: landRecord.land_use,
          landLevel: landRecord.land_level,
          unitLevel: landRecord.administrativeUnit.unit_level,
          amountPerArea: amountPerArea,
          landPreparation: landRecord.land_preparation,
          calculationDate: new Date(),
          formula: 'area * amount_per_area',
          administrativeUnit: {
            id: userAdminUnit.id,
            name: userAdminUnit.name,
            level: userAdminUnit.unit_level
          }
        }
      });

      // Create PaymentSchedule record
      const schedule = await PaymentSchedule.create({
        land_payment_id: landPayment.id,
        expected_amount: expectedAmount,
        due_date: new Date(dueDate),
        grace_period_days: TAX_CONSTANTS.GRACE_PERIOD_DAYS,
        penalty_rate: TAX_CONSTANTS.PENALTY_RATE,
        is_active: true,
        description: description || `ዓመታዊ የመሬት ግብር - ${userAdminUnit.name} - ${landRecord.land_use} - ደረጃ ${landRecord.land_level}`,
        calculation_metadata: {
          area: landRecord.area,
          landUse: landRecord.land_use,
          landLevel: landRecord.land_level,
          unitLevel: landRecord.administrativeUnit.unit_level,
          amountPerArea: amountPerArea,
          effectiveUnitLevel: getEffectiveUnitLevel(landRecord.administrativeUnit.unit_level),
          formula: 'area * amount_per_area',
          landPreparation: landRecord.land_preparation,
          administrativeUnit: {
            id: userAdminUnit.id,
            name: userAdminUnit.name,
            level: userAdminUnit.unit_level
          },
          createdByAdminUnit: userAdminUnitId
        }
      });

      schedules.push(schedule);
      processedCount++;

      console.log(`✅ Created tax schedule for land record ${landRecord.id}: ETB ${expectedAmount}`);

    } catch (error) {
      errorCount++;
      handleLandRecordError(landRecord.id, error, 'create tax schedule');
      continue;
    }
  }

  // Final summary
  console.log(`Tax schedule creation completed:
    - Total land records: ${landRecords.length}
    - Successfully processed: ${processedCount}
    - Skipped: ${skippedCount}
    - Errors: ${errorCount}
    - Admin Unit: ${userAdminUnit.name}`);

  if (schedules.length === 0) {
    throw new Error(`በ${userAdminUnit.name} አስተዳደራዊ ክፍል ውስጥ ምንም የክፍያ መርሃ ግብር አልተፈጠረም`);
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

const getSchedulesService = async () => {
  const schedules = await PaymentSchedule.findAll({
    include: [
      {
        model: LandPayment,
        as: 'landPayment',
        attributes: ['id', 'payment_type', 'total_amount', 'paid_amount', 'remaining_amount', 'annual_payment'],
        include: [
          {
            model: LandRecord,
            as: 'landRecord',
            attributes: ['id', 'ownership_type', 'area', 'land_use', 'land_level', 'land_preparation'],
            include: [{ model: User, as: 'owners', through: { attributes: [] } }],
          },
        ],
      },
    ],
  });
  return schedules;
};

const deleteSchedule = async (scheduleId) => {
  const schedule = await PaymentSchedule.findByPk(scheduleId);
  if (!schedule) {
    throw new Error('Payment schedule not found');
  }
  await schedule.update({ is_active: false });
  return schedule;
}


module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
  checkOverdueSchedules,
  getSchedulesService,
  deleteSchedule
};