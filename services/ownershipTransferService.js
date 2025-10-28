// // services/OwnershipTransferService.js

// const { OwnershipTransfer, Sequelize } = require("../models");

// /**
//  * Calculate fees based on user-provided rates and property values
//  */
// const calculateFees = (data) => {
//   const {
//     property_area,
//     land_value,
//     building_value,
//     service_rate,
//     tax_rate
//   } = data;

//   // Convert rates from percentage to decimal
//   const serviceRate = parseFloat(service_rate) / 100;
//   const taxRate = parseFloat(tax_rate) / 100;

//   const area = parseFloat(property_area) || 0;
//   const landRate = parseFloat(land_value) || 0;
//   const building = parseFloat(building_value) || 0;
  
//   // Calculate base value
//   const baseValue = landRate * area + building;

//   // Calculate fees
//   const serviceFee = baseValue * serviceRate;
//   const taxAmount = baseValue * taxRate;
//   const totalPayable = serviceFee + taxAmount;

//   return {
//     baseValue: parseFloat(baseValue.toFixed(2)),
//     serviceFee: parseFloat(serviceFee.toFixed(2)),
//     taxAmount: parseFloat(taxAmount.toFixed(2)),
//     totalPayable: parseFloat(totalPayable.toFixed(2)),
//     serviceRate: serviceRate * 100,
//     taxRate: taxRate * 100
//   };
// };

// /**
//  * Check if transfer is free inheritance (parent ↔ child)
//  */
// const isFreeInheritance = (transferType, inheritanceRelation) => {
//   return transferType === "በውርስ የተገኘ ቤት እና ይዞታ ስመ-ንብረት ዝውውር" &&
//          (inheritanceRelation === "ከልጅ ወደ ወላጅ" || inheritanceRelation === "ከወላጅ ወደ ልጅ");
// };

// /**
//  * Prepare transfer data for database
//  */
// const prepareTransferData = (data, adminUnitId, feeCalculation) => {
//   const {
//     property_use,
//     transfer_type,
//     inheritance_relation,
//     plot_number,
//     parcel_number,
//     property_area,
//     land_value,
//     building_value,
//     property_location,
//     transceiver_full_name,
//     transceiver_phone,
//     transceiver_email,
//     transceiver_nationalid,
//     recipient_full_name,
//     recipient_phone,
//     recipient_email,
//     recipient_nationalid,
//     files = []
//   } = data;

//   return {
//     property_use,
//     transfer_type,
//     inheritance_relation,
//     plot_number,
//     parcel_number,
//     property_area: parseFloat(property_area) || null,
//     land_value: parseFloat(land_value) || null,
//     building_value: parseFloat(building_value) || null,
//     property_location,
//     base_value: feeCalculation.baseValue,
//     service_fee: feeCalculation.serviceFee,
//     service_rate: feeCalculation.serviceRate,
//     tax_amount: feeCalculation.taxAmount,
//     tax_rate: feeCalculation.taxRate,
//     total_payable: feeCalculation.totalPayable,
//     transceiver_full_name,
//     transceiver_phone: parseInt(transceiver_phone),
//     transceiver_email,
//     transceiver_nationalid,
//     recipient_full_name,
//     recipient_phone: parseInt(recipient_phone),
//     recipient_email,
//     recipient_nationalid,
//     administrative_unit_id: adminUnitId,
//     file: files
//   };
// };

// /**
//  * Validate required fields
//  */
// const validateRequiredFields = (data) => {
//   const requiredFields = [
//     'transceiver_full_name', 
//     'transceiver_phone',
//     'recipient_full_name', 
//     'recipient_phone',
//     'property_use',
//     'transfer_type'
//   ];

//   const missingFields = requiredFields.filter(field => !data[field]);
  
//   if (missingFields.length > 0) {
//     throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
//   }
// };

// /**
//  * Validate rates for non-free inheritance
//  */
// const validateRates = (data) => {
//   const { service_rate, tax_rate, transfer_type, inheritance_relation } = data;

//   // Skip validation for free inheritance
//   if (isFreeInheritance(transfer_type, inheritance_relation)) {
//     return;
//   }

//   if (!service_rate || !tax_rate) {
//     throw new Error('Service rate and tax rate are required for non-inheritance transfers');
//   }

//   const serviceRate = parseFloat(service_rate);
//   const taxRate = parseFloat(tax_rate);

//   if (serviceRate < 0 || serviceRate > 100) {
//     throw new Error('Service rate must be between 0 and 100');
//   }

//   if (taxRate < 0 || taxRate > 100) {
//     throw new Error('Tax rate must be between 0 and 100');
//   }
// };

// /**
//  * Main service to create ownership transfer
//  */
// const CreateTransferService = async (data, adminUnitId) => {
//   try {
//     validateRequiredFields(data);
//     validateRates(data);

//     const { transfer_type, inheritance_relation } = data;
//     let calculationData = { ...data };

//     if (isFreeInheritance(transfer_type, inheritance_relation)) {
//       calculationData.service_rate = 0;
//       calculationData.tax_rate = 0;
//     }

//     const feeCalculation = calculateFees(calculationData);
//     const transferData = prepareTransferData(data, adminUnitId, feeCalculation);

//     const ownershipTransfer = await OwnershipTransfer.create(transferData);

//     await createAuditLog({
//       action: 'CREATE_OWNERSHIP_TRANSFER',
//       entity: 'OwnershipTransfer',
//       entityId: ownershipTransfer.id,
//       adminUnitId,
//       details: {
//         transfer_type: data.transfer_type,
//         property_use: data.property_use,
//         total_payable: feeCalculation.totalPayable
//       }
//     });

//     return {
//       id: ownershipTransfer.id,
//       plot_number: ownershipTransfer.plot_number,
//       total_payable: ownershipTransfer.total_payable,
//       transfer_type: ownershipTransfer.transfer_type,
//       created_at: ownershipTransfer.createdAt,
//       fee_breakdown: feeCalculation
//     };

//   } catch (error) {
//     console.error('CreateTransferService Error:', error);
//     throw new Error(`Failed to create ownership transfer: ${error.message}`);
//   }
// };

// /**
//  * Preview fee calculation
//  */
// const previewFeeCalculation = async (data) => {
//   try {
//     const requiredFields = ['property_area', 'land_value', 'building_value'];
//     const missingFields = requiredFields.filter(field => !data[field]);
    
//     if (missingFields.length > 0) {
//       throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
//     }

//     let calculationData = { ...data };
//     if (isFreeInheritance(data.transfer_type, data.inheritance_relation)) {
//       calculationData.service_rate = 0;
//       calculationData.tax_rate = 0;
//     }

//     const feeCalculation = calculateFees(calculationData);

//     return {
//       success: true,
//       data: {
//         ...feeCalculation,
//         is_free_inheritance: isFreeInheritance(data.transfer_type, data.inheritance_relation)
//       }
//     };

//   } catch (error) {
//     console.error('PreviewFeeCalculation Error:', error);
//     throw new Error(`Failed to calculate fees: ${error.message}`);
//   }
// };

// /**
//  * Get transfers with pagination and filtering
//  */
// const GetTransfersService = async ({ page, limit, transfer_type, property_use, adminUnitId }) => {
//   try {
//     const offset = (page - 1) * limit;

//     const whereClause = { administrative_unit_id: adminUnitId };

//     if (transfer_type) whereClause.transfer_type = transfer_type;
//     if (property_use) whereClause.property_use = property_use;

//     const { count, rows } = await OwnershipTransfer.findAndCountAll({
//       where: whereClause,
//       limit,
//       offset,
//       order: [['createdAt', 'DESC']],
//       attributes: [
//         'id', 'plot_number', 'property_use', 'transfer_type', 
//         'total_payable', 'createdAt', 'transceiver_full_name',
//         'recipient_full_name'
//       ]
//     });

//     return {
//       data: rows,
//       pagination: {
//         currentPage: page,
//         totalPages: Math.ceil(count / limit),
//         totalItems: count,
//         itemsPerPage: limit
//       }
//     };

//   } catch (error) {
//     console.error('GetTransfersService Error:', error);
//     throw new Error('Failed to fetch transfers');
//   }
// };

// /**
//  * Get single transfer by ID
//  */
// const GetTransferByIdService = async (id, adminUnitId) => {
//   try {
//     const transfer = await OwnershipTransfer.findOne({
//       where: { id, administrative_unit_id: adminUnitId }
//     });

//     return transfer;

//   } catch (error) {
//     console.error('GetTransferByIdService Error:', error);
//     throw new Error('Failed to fetch transfer');
//   }
// };

// /**
//  * Update transfer status
//  */
// const UpdateTransferStatusService = async (id, status, adminUnitId) => {
//   try {
//     const transfer = await OwnershipTransfer.findOne({
//       where: { id, administrative_unit_id: adminUnitId }
//     });

//     if (!transfer) {
//       throw new Error('Ownership transfer not found');
//     }

//     const updatedTransfer = await transfer.update({ status });

//     await createAuditLog({
//       action: 'UPDATE_TRANSFER_STATUS',
//       entity: 'OwnershipTransfer',
//       entityId: id,
//       adminUnitId,
//       details: {
//         previousStatus: transfer.status,
//         newStatus: status
//       }
//     });

//     return updatedTransfer;

//   } catch (error) {
//     console.error('UpdateTransferStatusService Error:', error);
//     throw new Error(`Failed to update transfer status: ${error.message}`);
//   }
// };

// /**
//  * Get transfer statistics
//  */
// const GetTransferStatsService = async (adminUnitId) => {
//   try {
//     const stats = await OwnershipTransfer.findAll({
//       where: { administrative_unit_id: adminUnitId },
//       attributes: [
//         [Sequelize.fn('COUNT', Sequelize.col('id')), 'total_transfers'],
//         [Sequelize.fn('SUM', Sequelize.col('total_payable')), 'total_revenue'],
//         [Sequelize.fn('AVG', Sequelize.col('total_payable')), 'average_payment'],
//         [Sequelize.literal(`COUNT(CASE WHEN transfer_type = 'በውርስ የተገኘ ቤት እና ይዞታ ስመ-ንብረት ዝውውር' THEN 1 END)`), 'inheritance_transfers'],
//         [Sequelize.literal(`COUNT(CASE WHEN transfer_type = 'በሽያጭ ወይም በስጦታ ስመ-ንብረት ዝውውር' THEN 1 END)`), 'sale_transfers']
//       ],
//       raw: true
//     });

//     return {
//       total_transfers: parseInt(stats[0].total_transfers) || 0,
//       total_revenue: parseFloat(stats[0].total_revenue) || 0,
//       average_payment: parseFloat(stats[0].average_payment) || 0,
//       inheritance_transfers: parseInt(stats[0].inheritance_transfers) || 0,
//       sale_transfers: parseInt(stats[0].sale_transfers) || 0
//     };

//   } catch (error) {
//     console.error('GetTransferStatsService Error:', error);
//     throw new Error('Failed to fetch statistics');
//   }
// };

// /**
//  * Audit log helper (you can implement based on your audit system)
//  */
// const createAuditLog = async (logData) => {
//   // Implement your audit logging logic here
//   console.log('Audit Log:', logData);
// };

// module.exports = {
//   CreateTransferService,
//   previewFeeCalculation,
//   GetTransfersService,
//   GetTransferByIdService,
//   UpdateTransferStatusService,
//   GetTransferStatsService
// };