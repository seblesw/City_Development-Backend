// controllers/ownershipTransferController.js

const {
  CreateTransferService,
  GetTransfersService,
  GetTransferByIdService,
  UpdateTransferStatusService,
  GetTransferStatsService,
} = require("../services/ownershipTransferService");

/**
 * Create ownership transfer with file upload
 */
const createTransferOwnership = async (req, res) => {
  try {
    let data;
    
    // Parse the data from FormData
    if (req.body.data) {
      data = JSON.parse(req.body.data);
    } else {
      data = req.body;
    }
    
    const adminUnitId = req.user.administrative_unit_id;
    const userId = req.user.id;
    
    // Get uploaded files from multer
    const files = req.files || [];
    
    // Add file paths to data for service
    data.uploadedFiles = files.map(file => ({
      originalname: file.originalname,
      filename: file.filename,
      path: file.path, // This will be the full path on disk
      serverRelativePath: file.serverRelativePath, // This is set in your multer config
      mimetype: file.mimetype,
      size: file.size
    }));

    const result = await CreateTransferService(data, adminUnitId, userId);

    return res.status(201).json(result);
  } catch (error) {
    console.error("Create Transfer Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


/**
 * Get all ownership transfers with pagination
 */
const getTransfers = async (req, res) => {
  try {
    const { page = 1, limit = 10, transfer_type, property_use } = req.query;

    const adminUnitId = req.user.administrative_unit_id;

    const result = await GetTransfersService({
      page: parseInt(page),
      limit: parseInt(limit),
      transfer_type,
      property_use,
      adminUnitId,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get Transfers Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transfers",
    });
  }
};

/**
 * Get single transfer by ID
 */
const getTransferById = async (req, res) => {
  try {
    const { id } = req.params;
    const adminUnitId = req.user.administrative_unit_id;

    const result = await GetTransferByIdService(id, adminUnitId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Ownership transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Get Transfer Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch transfer",
    });
  }
};

/**
 * Update transfer status
 */
const updateTransferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminUnitId = req.user.administrative_unit_id;

    const result = await UpdateTransferStatusService(id, status, adminUnitId);

    return res.status(200).json({
      success: true,
      message: "Transfer status updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Update Status Error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get transfer statistics
 */
const getTransferStats = async (req, res) => {
  try {
    const adminUnitId = req.user.administrative_unit_id;

    const stats = await GetTransferStatsService(adminUnitId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get Stats Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
};

module.exports = {
  createTransferOwnership,
  getTransfers,
  getTransferById,
  updateTransferStatus,
  getTransferStats,
};
