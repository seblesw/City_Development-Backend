// services/OwnershipTransferService.js

/**
 * Calculate fees based on user-provided rates and property values
 */
const calculateFees = (data) => {
  const {
    property_area,
    land_value,
    building_value,
    service_rate,
    tax_rate,
    transfer_type,
    inheritance_relation
  } = data;

  // Convert rates from percentage to decimal
  const serviceRate = parseFloat(service_rate) / 100;
  const taxRate = parseFloat(tax_rate) / 100;

  const area = parseFloat(property_area) || 0;
  const landRate = parseFloat(land_value) || 0;
  const building = parseFloat(building_value) || 0;
  
  // Calculate base value
  const baseValue = landRate * area + building;

  // Calculate fees
  const serviceFee = baseValue * serviceRate;
  const taxAmount = baseValue * taxRate;
  const totalPayable = serviceFee + taxAmount;

  return {
    baseValue: parseFloat(baseValue.toFixed(2)),
    serviceFee: parseFloat(serviceFee.toFixed(2)),
    taxAmount: parseFloat(taxAmount.toFixed(2)),
    totalPayable: parseFloat(totalPayable.toFixed(2)),
    serviceRate: serviceRate * 100,
    taxRate: taxRate * 100
  };
};

/**
 * Check if transfer is free inheritance (parent ↔ child)
 */
const isFreeInheritance = (transferType, inheritanceRelation) => {
  return transferType === "በውርስ የተገኘ ቤት እና ይዞታ ስመ-ንብረት ዝውውር" &&
         (inheritanceRelation === "ከልጅ ወደ ወላጅ" || inheritanceRelation === "ከወላጅ ወደ ልጅ");
};

/**
 * Prepare transfer data for database
 */
const prepareTransferData = (data, adminUnitId, feeCalculation) => {
  const {
    // Property Information
    property_use,
    transfer_type,
    inheritance_relation,
    plot_number,
    parcel_number,
    property_area,
    land_value,
    building_value,
    property_location,
    
    // Personal Information
    transceiver_full_name,
    transceiver_phone,
    transceiver_email,
    transceiver_nationalid,
    recipient_full_name,
    recipient_phone,
    recipient_email,
    recipient_nationalid,
    
    // Files
    files = []
  } = data;

  return {
    // Property Information
    property_use,
    transfer_type,
    inheritance_relation,
    plot_number,
    parcel_number,
    property_area: parseFloat(property_area) || null,
    land_value: parseFloat(land_value) || null,
    building_value: parseFloat(building_value) || null,
    property_location,
    
    // Fee Calculation
    base_value: feeCalculation.baseValue,
    service_fee: feeCalculation.serviceFee,
    service_rate: feeCalculation.serviceRate,
    tax_amount: feeCalculation.taxAmount,
    tax_rate: feeCalculation.taxRate,
    total_payable: feeCalculation.totalPayable,
    
    // Personal Information
    transceiver_full_name,
    transceiver_phone: parseInt(transceiver_phone),
    transceiver_email,
    transceiver_nationalid,
    recipient_full_name,
    recipient_phone: parseInt(recipient_phone),
    recipient_email,
    recipient_nationalid,
    administrative_unit_id: adminUnitId,
    
    // Files
    file: files
  };
};

/**
 * Validate required fields
 */
const validateRequiredFields = (data) => {
  const requiredFields = [
    'transceiver_full_name', 
    'transceiver_phone',
    'recipient_full_name', 
    'recipient_phone',
    'property_use',
    'transfer_type'
  ];

  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
};

/**
 * Validate rates for non-free inheritance
 */
const validateRates = (data) => {
  const { service_rate, tax_rate, transfer_type, inheritance_relation } = data;

  // Skip validation for free inheritance
  if (isFreeInheritance(transfer_type, inheritance_relation)) {
    return;
  }

  if (!service_rate || !tax_rate) {
    throw new Error('Service rate and tax rate are required for non-inheritance transfers');
  }

  const serviceRate = parseFloat(service_rate);
  const taxRate = parseFloat(tax_rate);

  if (serviceRate < 0 || serviceRate > 100) {
    throw new Error('Service rate must be between 0 and 100');
  }

  if (taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be between 0 and 100');
  }
};

/**
 * Main service to create ownership transfer
 */
const CreateTransferService = async (data, adminUnitId) => {
  try {
    // Step 1: Validate input data
    validateRequiredFields(data);
    validateRates(data);

    // Step 2: Prepare rates for calculation
    const { transfer_type, inheritance_relation } = data;
    let calculationData = { ...data };

    // For free inheritance, set rates to 0
    if (isFreeInheritance(transfer_type, inheritance_relation)) {
      calculationData.service_rate = 0;
      calculationData.tax_rate = 0;
    }

    // Step 3: Calculate fees
    const feeCalculation = calculateFees(calculationData);

    // Step 4: Prepare data for database
    const transferData = prepareTransferData(data, adminUnitId, feeCalculation);

    // Step 5: Create record
    const ownershipTransfer = await db.OwnershipTransfer.create(transferData);

    // Step 6: Log the action
    await createAuditLog({
      action: 'CREATE_OWNERSHIP_TRANSFER',
      entity: 'OwnershipTransfer',
      entityId: ownershipTransfer.id,
      adminUnitId,
      details: {
        transfer_type: data.transfer_type,
        property_use: data.property_use,
        total_payable: feeCalculation.totalPayable,
        is_free_inheritance: isFreeInheritance(transfer_type, inheritance_relation)
      }
    });

    // Step 7: Return result
    return {
      id: ownershipTransfer.id,
      plot_number: ownershipTransfer.plot_number,
      total_payable: ownershipTransfer.total_payable,
      transfer_type: ownershipTransfer.transfer_type,
      created_at: ownershipTransfer.createdAt,
      fee_breakdown: feeCalculation
    };

  } catch (error) {
    console.error('CreateTransferService Error:', error);
    throw new Error(`Failed to create ownership transfer: ${error.message}`);
  }
};

/**
 * Preview fee calculation
 */
const previewFeeCalculation = async (data) => {
  try {
    const requiredFields = ['property_area', 'land_value', 'building_value'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Handle free inheritance case
    let calculationData = { ...data };
    if (isFreeInheritance(data.transfer_type, data.inheritance_relation)) {
      calculationData.service_rate = 0;
      calculationData.tax_rate = 0;
    }

    const feeCalculation = calculateFees(calculationData);

    return {
      success: true,
      data: {
        ...feeCalculation,
        is_free_inheritance: isFreeInheritance(data.transfer_type, data.inheritance_relation),
        calculation_formula: 'base_value = (land_value × property_area) + building_value'
      }
    };

  } catch (error) {
    console.error('PreviewFeeCalculation Error:', error);
    throw new Error(`Failed to calculate fees: ${error.message}`);
  }
};

module.exports = {
  CreateTransferService,
  previewFeeCalculation
};