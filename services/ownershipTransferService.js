// services/OwnershipTransferService.js

const { OwnershipTransfer, Sequelize } = require("../models");

/**
 * Main service to create ownership transfer
 */
const CreateTransferService = async (data, adminUnitId) => {
  try {

    // Validate rates for non-free inheritance
    const { service_rate, tax_rate, transfer_type, inheritance_relation } = data;

    // Check if transfer is free inheritance (parent ↔ child)
    const isFreeTransfer = transfer_type === "በውርስ የተገኘ" &&
      (inheritance_relation === "ከልጅ ወደ ወላጅ" || inheritance_relation === "ከወላጅ ወደ ልጅ");

    // Skip validation for free inheritance
    if (!isFreeTransfer) {
      if (!service_rate || !tax_rate) {
        throw new Error('Service rate and tax rate are required for non-inheritance transfers');
      }

      const serviceRateVal = parseFloat(service_rate);
      const taxRateVal = parseFloat(tax_rate);

      if (serviceRateVal < 0 || serviceRateVal > 100) {
        throw new Error('Service rate must be between 0 and 100');
      }

      if (taxRateVal < 0 || taxRateVal > 100) {
        throw new Error('Tax rate must be between 0 and 100');
      }
    }

    // Calculate fees based on user-provided rates and property values
    const calculationData = { ...data };

    if (isFreeTransfer) {
      calculationData.service_rate = 0;
      calculationData.tax_rate = 0;
    }

    const {
      property_area,
      land_value,
      building_value,
      service_rate: calc_service_rate,
      tax_rate: calc_tax_rate
    } = calculationData;

    // Convert rates from percentage to decimal
    const serviceRateDecimal = parseFloat(calc_service_rate) / 100;
    const taxRateDecimal = parseFloat(calc_tax_rate) / 100;

    const area = parseFloat(property_area) || 0;
    const landRate = parseFloat(land_value) || 0;
    const buildingVal = parseFloat(building_value) || 0;
    
    // Calculate base value
    const baseValue = landRate * area + buildingVal;

    // Calculate fees
    const serviceFee = baseValue * serviceRateDecimal;
    const taxAmount = baseValue * taxRateDecimal;
    const totalPayable = serviceFee + taxAmount;

    const feeCalculation = {
      baseValue: parseFloat(baseValue.toFixed(2)),
      serviceFee: parseFloat(serviceFee.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      totalPayable: parseFloat(totalPayable.toFixed(2)),
      serviceRate: serviceRateDecimal * 100,
      taxRate: taxRateDecimal * 100
    };

    // Prepare transfer data for database
    const {
      property_use,
      plot_number,
      parcel_number,
      property_location,
      transceiver_full_name,
      transceiver_phone,
      transceiver_email,
      transceiver_nationalid,
      recipient_full_name,
      recipient_phone,
      recipient_email,
      recipient_nationalid,
      files = []
    } = data;

    const transferData = {
      property_use,
      transfer_type,
      inheritance_relation,
      plot_number,
      parcel_number,
      land_area: parseFloat(property_area) || null,
      land_value: parseFloat(land_value) || null,
      building_value: parseFloat(building_value) || null,
      property_location,
      base_value: feeCalculation.baseValue,
      service_fee: feeCalculation.serviceFee,
      service_rate: feeCalculation.serviceRate,
      tax_amount: feeCalculation.taxAmount,
      tax_rate: feeCalculation.taxRate,
      total_payable: feeCalculation.totalPayable,
      transceiver_full_name,
      transceiver_phone: transceiver_phone.toString(),
      transceiver_email,
      transceiver_nationalid,
      recipient_full_name,
      recipient_phone: recipient_phone.toString(),
      recipient_email,
      recipient_nationalid,
      administrative_unit_id: adminUnitId,
      file: files
    };

    const ownershipTransfer = await OwnershipTransfer.create(transferData);

    return {
      success: true,
      message: "Ownership transfer created successfully",
      data: {
        id: ownershipTransfer.id,
        plot_number: ownershipTransfer.plot_number,
        total_payable: ownershipTransfer.total_payable,
        transfer_type: ownershipTransfer.transfer_type,
        created_at: ownershipTransfer.createdAt,
        fee_breakdown: feeCalculation,
        is_free_inheritance: isFreeTransfer
      }
    };

  } catch (error) {
    console.error('CreateTransferService Error:', error);
    
    // Handle specific error types
    if (error.name === 'SequelizeValidationError') {
      const validationErrors = error.errors.map(err => err.message);
      throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error('A transfer with similar details already exists');
    }

    throw new Error(`Failed to create ownership transfer: ${error.message}`);
  }
};


/**
 * Get transfers with pagination and filtering
 */
const GetTransfersService = async ({ page, limit, transfer_type, property_use, adminUnitId }) => {
  try {
    const offset = (page - 1) * limit;

    const whereClause = { administrative_unit_id: adminUnitId };

    if (transfer_type) whereClause.transfer_type = transfer_type;
    if (property_use) whereClause.property_use = property_use;

    const { count, rows } = await OwnershipTransfer.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [['createdAt', 'DESC']],
      attributes: [
        'id', 'plot_number', 'property_use', 'transfer_type', 
        'total_payable', 'createdAt', 'transceiver_full_name',
        'recipient_full_name'
      ]
    });

    return {
      data: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: limit
      }
    };

  } catch (error) {
    console.error('GetTransfersService Error:', error);
    throw new Error('Failed to fetch transfers');
  }
};

/**
 * Get single transfer by ID
 */
const GetTransferByIdService = async (id, adminUnitId) => {
  try {
    const transfer = await OwnershipTransfer.findOne({
      where: { id, administrative_unit_id: adminUnitId }
    });

    return transfer;

  } catch (error) {
    console.error('GetTransferByIdService Error:', error);
    throw new Error('Failed to fetch transfer');
  }
};

/**
 * Update transfer status
 */
const UpdateTransferStatusService = async (id, status, adminUnitId) => {
  try {
    const transfer = await OwnershipTransfer.findOne({
      where: { id, administrative_unit_id: adminUnitId }
    });

    if (!transfer) {
      throw new Error('Ownership transfer not found');
    }

    const updatedTransfer = await transfer.update({ status });

    await createAuditLog({
      action: 'UPDATE_TRANSFER_STATUS',
      entity: 'OwnershipTransfer',
      entityId: id,
      adminUnitId,
      details: {
        previousStatus: transfer.status,
        newStatus: status
      }
    });

    return updatedTransfer;

  } catch (error) {
    console.error('UpdateTransferStatusService Error:', error);
    throw new Error(`Failed to update transfer status: ${error.message}`);
  }
};

/**
 * Get transfer statistics
 */
const GetTransferStatsService = async (adminUnitId) => {
  try {
    const stats = await OwnershipTransfer.findAll({
      where: { administrative_unit_id: adminUnitId },
      attributes: [
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_transfers'],
        [Sequelize.fn('SUM', Sequelize.col('total_payable')), 'total_revenue'],
        [Sequelize.fn('AVG', Sequelize.col('total_payable')), 'average_payment'],
        [Sequelize.literal(`COUNT(CASE WHEN transfer_type = 'በውርስ የተገኘ ቤት እና ይዞታ ስመ-ንብረት ዝውውር' THEN 1 END)`), 'inheritance_transfers'],
        [Sequelize.literal(`COUNT(CASE WHEN transfer_type = 'በሽያጭ ወይም በስጦታ ስመ-ንብረት ዝውውር' THEN 1 END)`), 'sale_transfers']
      ],
      raw: true
    });

    return {
      total_transfers: parseInt(stats[0].total_transfers) || 0,
      total_revenue: parseFloat(stats[0].total_revenue) || 0,
      average_payment: parseFloat(stats[0].average_payment) || 0,
      inheritance_transfers: parseInt(stats[0].inheritance_transfers) || 0,
      sale_transfers: parseInt(stats[0].sale_transfers) || 0
    };

  } catch (error) {
    console.error('GetTransferStatsService Error:', error);
    throw new Error('Failed to fetch statistics');
  }
};

module.exports = {
  CreateTransferService,
  GetTransfersService,
  GetTransferByIdService,
  UpdateTransferStatusService,
  GetTransferStatsService
};