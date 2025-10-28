// // controllers/ownershipTransferController.js

// const { CreateTransferService, previewFeeCalculation, GetTransfersService, GetTransferByIdService, UpdateTransferStatusService, GetTransferStatsService } = require("../services/ownershipTransferService");

// /**
//  * Create ownership transfer
//  */
// const createTransferOwnership = async (req, res) => {
//   try {
//     const data = req.body;
//     const adminUnitId = req.user.administrative_unit_id;

//     const result = await CreateTransferService(data, adminUnitId);
    
//     return res.status(201).json({
//       success: true,
//       message: 'Ownership transfer created successfully',
//       data: result
//     });
    
//   } catch (error) {
//     console.error('Create Transfer Error:', error);
    
//     return res.status(400).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

// /**
//  * Preview fee calculation
//  */
// const previewCalculation = async (req, res) => {
//   try {
//     const data = req.body;

//     const result = await previewFeeCalculation(data);
    
//     return res.status(200).json(result);
    
//   } catch (error) {
//     console.error('Preview Calculation Error:', error);
    
//     return res.status(400).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

// /**
//  * Get all ownership transfers with pagination
//  */
// const getTransfers = async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 10, 
//       transfer_type, 
//       property_use 
//     } = req.query;
    
//     const adminUnitId = req.user.administrative_unit_id;

//     const result = await GetTransfersService({
//       page: parseInt(page),
//       limit: parseInt(limit),
//       transfer_type,
//       property_use,
//       adminUnitId
//     });
    
//     return res.status(200).json({
//       success: true,
//       data: result.data,
//       pagination: result.pagination
//     });
    
//   } catch (error) {
//     console.error('Get Transfers Error:', error);
    
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch transfers'
//     });
//   }
// };

// /**
//  * Get single transfer by ID
//  */
// const getTransferById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const adminUnitId = req.user.administrative_unit_id;

//     const result = await GetTransferByIdService(id, adminUnitId);
    
//     if (!result) {
//       return res.status(404).json({
//         success: false,
//         message: 'Ownership transfer not found'
//       });
//     }
    
//     return res.status(200).json({
//       success: true,
//       data: result
//     });
    
//   } catch (error) {
//     console.error('Get Transfer Error:', error);
    
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch transfer'
//     });
//   }
// };

// /**
//  * Update transfer status
//  */
// const updateTransferStatus = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { status } = req.body;
//     const adminUnitId = req.user.administrative_unit_id;

//     const result = await UpdateTransferStatusService(id, status, adminUnitId);
    
//     return res.status(200).json({
//       success: true,
//       message: 'Transfer status updated successfully',
//       data: result
//     });
    
//   } catch (error) {
//     console.error('Update Status Error:', error);
    
//     return res.status(400).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

// /**
//  * Get transfer statistics
//  */
// const getTransferStats = async (req, res) => {
//   try {
//     const adminUnitId = req.user.administrative_unit_id;

//     const stats = await GetTransferStatsService(adminUnitId);
    
//     return res.status(200).json({
//       success: true,
//       data: stats
//     });
    
//   } catch (error) {
//     console.error('Get Stats Error:', error);
    
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch statistics'
//     });
//   }
// };

// module.exports = {
//   createTransferOwnership,
//   previewCalculation,
//   getTransfers,
//   getTransferById,
//   updateTransferStatus,
//   getTransferStats
// };