const { LandPayment, PaymentSchedule, LandRecord, User, sequelize,PAYMENT_TYPES, PAYMENT_STATUSES, LAND_PREPARATION, LAND_USE_TYPES, AdministrativeUnit  } = require('../models');
const {Op} = require('sequelize');

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

const createTaxSchedules = async (dueDate, description = '') => {
  const landRecords = await LandRecord.findAll({
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
    throw new Error('የመሬት መዝገብ አልተገኘም');
  }
  const schedules = [];
  
  // Define tax rate tables per square meter (ETB) - USING AMHARIC LAND USE TYPES
  const TAX_RATES = {
    "መኖሪያ": { // RESIDENTIAL
      1: { 1: 4.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 1.5 },
      2: { 1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5, 5: 1.0 },
      3: { 1: 3.0, 2: 2.5, 3: 2.0, 4: 1.5, 5: 1.0 },
      4: { 1: 2.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 1.0 },
      5: { 1: 2.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 1.0 },
      6: { 1: 2.0, 2: 2.0, 3: 1.0, 4: 1.0, 5: 1.0 }
    },
    
    "ንግድ": { // COMMERCIAL
      1: { 1: 8.0, 2: 6.0, 3: 5.0, 4: 4.0, 5: 3.0 },
      2: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.0 },
      3: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.0 },
      4: { 1: 4.0, 2: 4.0, 3: 3.0, 4: 2.0, 5: 2.0 },
      5: { 1: 4.0, 2: 4.0, 3: 3.0, 4: 2.0, 5: 2.0 },
      6: { 1: 4.0, 2: 4.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    
    "ኢንዱስትሪ": { // INDUSTRIAL
      1: { 1: 6.0, 2: 5.0, 3: 4.0, 4: 3.0, 5: 2.5 },
      2: { 1: 5.0, 2: 4.0, 3: 3.0, 4: 2.5, 5: 2.0 },
      3: { 1: 5.0, 2: 4.0, 3: 3.0, 4: 2.5, 5: 2.0 },
      4: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      5: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      6: { 1: 3.0, 2: 3.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    
    "መንግስታዊ ተቋማት": { // GOVERNMENT_ORGANIZATION
      1: { 1: 2.0, 2: 1.5, 3: 1.0, 4: 0.8, 5: 0.5 },
      2: { 1: 1.5, 2: 1.0, 3: 0.8, 4: 0.5, 5: 0.3 },
      3: { 1: 1.5, 2: 1.0, 3: 0.8, 4: 0.5, 5: 0.3 },
      4: { 1: 1.0, 2: 1.0, 3: 0.5, 4: 0.3, 5: 0.3 },
      5: { 1: 1.0, 2: 1.0, 3: 0.5, 4: 0.3, 5: 0.3 },
      6: { 1: 1.0, 2: 1.0, 3: 0.3, 4: 0.3, 5: 0.3 }
    },
    
    "ማህበራዊ አገልግሎት": { // SERVICE
      1: { 1: 5.0, 2: 4.0, 3: 3.5, 4: 3.0, 5: 2.5 },
      2: { 1: 4.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 2.0 },
      3: { 1: 4.0, 2: 3.5, 3: 3.0, 4: 2.5, 5: 2.0 },
      4: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      5: { 1: 3.0, 2: 3.0, 3: 2.5, 4: 2.0, 5: 2.0 },
      6: { 1: 3.0, 2: 3.0, 3: 2.0, 4: 2.0, 5: 2.0 }
    },
    
    "ከተማ ግብርና": { // URBAN_AGRICULTURE
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
    if (landRecord.land_preparation !== "ነባር") {
      return 0;
    }

    const amountPerArea = getAmountPerArea(landRecord);
    const annualTax = landRecord.area * amountPerArea;
    const result = Number(annualTax.toFixed(2));
    return result;
  };
  
  for (const landRecord of landRecords) {
    
    if (!landRecord.owners || !landRecord.owners.length) {
      console.warn(`⏭️  Record ${landRecord.id}: No owner, skipping`);
      continue;
    }

    if (!landRecord.administrativeUnit) {
      continue;
    }

    const firstOwner = landRecord.owners[0];
    
    try {
      // Calculate expected amount using the robust calculation
      const expectedAmount = calculateExpectedAmount(landRecord);
      
      // Skip if no tax is applicable (non-existing land preparation)
      if (expectedAmount <= 0) {
        continue;
      }

      const amountPerArea = getAmountPerArea(landRecord);
      
      const landPayment = await LandPayment.create({
        land_record_id: landRecord.id,
        payment_type: PAYMENT_TYPES.TAX,
        total_amount: expectedAmount,
        paid_amount: 0,
        remaining_amount: expectedAmount,
        payment_status: PAYMENT_STATUSES.PENDING,
        currency: 'ETB',
        payer_id: firstOwner.id,
        calculation_details: {
          area: landRecord.area,
          landUse: landRecord.land_use,
          landLevel: landRecord.land_level,
          unitLevel: landRecord.administrativeUnit.unit_level,
          amountPerArea: amountPerArea,
          landPreparation: landRecord.land_preparation,
          calculationDate: new Date(),
          formula: 'area * amount_per_area'
        }
      });

      const schedule = await PaymentSchedule.create({
        land_payment_id: landPayment.id,
        expected_amount: expectedAmount,
        due_date: new Date(dueDate),
        grace_period_days: 15,
        penalty_rate: 0.07,
        is_active: true,
        description: description || `ዓመታዊ የመሬት ግብር - ${landRecord.land_use} - ደረጃ ${landRecord.land_level}`,
        calculation_metadata: {
          area: landRecord.area,
          landUse: landRecord.land_use,
          landLevel: landRecord.land_level,
          unitLevel: landRecord.administrativeUnit.unit_level,
          amountPerArea: amountPerArea,
          effectiveUnitLevel: getEffectiveUnitLevel(landRecord.administrativeUnit.unit_level),
          formula: 'area * amount_per_area',
          landPreparation: landRecord.land_preparation
        }
      });

      schedules.push(schedule);
      

    } catch (error) {
      continue;
    }
  }

  
  if (schedules.length === 0) {

    throw new Error('ምንም የክፍያ መርሃ ግብር አልተፈጠረም');
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

module.exports = {
  createTaxSchedules,
  createLeaseSchedules,
  checkOverdueSchedules,
  getSchedulesService
};