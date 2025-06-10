const {
  createLandRecordService,
  getAllLandRecordsService,
  getLandRecordByIdService,
  updateLandRecordService,
  deleteLandRecordService,
} = require('../services/landRecordService');

exports.createLandRecord = async (req, res) => {
  try {
    const landRecord = await createLandRecordService(req.body);
    return res.status(201).json({
      status: 'success',
      message: 'Land record created successfully',
      data: landRecord,
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.getAllLandRecords = async (req, res) => {
  try {
    const landRecords = await getAllLandRecordsService();
    return res.status(200).json({
      status: 'success',
      message: 'Land records retrieved successfully',
      data: landRecords,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.getLandRecordById = async (req, res) => {
  try {
    const landRecord = await getLandRecordByIdService(req.params.id);
    return res.status(200).json({
      status: 'success',
      message: 'Land record retrieved successfully',
      data: landRecord,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 500).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.updateLandRecord = async (req, res) => {
  try {
    const landRecord = await updateLandRecordService(req.params.id, req.body);
    return res.status(200).json({
      status: 'success',
      message: 'Land record updated successfully',
      data: landRecord,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 400).json({
      status: 'error',
      message: error.message,
    });
  }
};

exports.deleteLandRecord = async (req, res) => {
  try {
    const result = await deleteLandRecordService(req.params.id);
    return res.status(200).json({
      status: 'success',
      message: result.message,
      data: null,
    });
  } catch (error) {
    return res.status(error.message.includes('not found') ? 404 : 400).json({
      status: 'error',
      message: error.message,
    });
  }
};