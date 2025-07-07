const {
  createLandRecordService,
  getAllLandRecordService,
  getLandRecordByIdService,
  updateLandRecordService,
  deleteLandRecordService,
} = require("../services/landRecordService");

// Creating a new land record
const createLandRecord = async (req, res) => {
  try {
    const user = req.user;

    // Parse string fields from form-data/request body
    const primary_user = JSON.parse(req.body.primary_user || '{}');
    const co_owners = JSON.parse(req.body.co_owners || '[]');
    const land_record = JSON.parse(req.body.land_record || '{}');
    const documents = JSON.parse(req.body.documents || '[]');
    const land_payment = JSON.parse(req.body.land_payment || '{}');

    const result = await createLandRecordService(
      {
        primary_user,
        co_owners,
        land_record,
        documents,
        land_payment,
      },
      req.files,
      user
    );

    return res.status(201).json({
      status: "success",
      message: "የመሬት መዝገብ በተሳካ ሁኔታ ተፈጥሯል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመዝገብ መፍጠር ስህተት: ${error.message}`,
    });
  }
};



// Retrieving all land records
const getAllLandRecords = async (req, res) => {
  try {
    const landRecords = await getAllLandRecordService(req.query);
    return res.status(200).json({
      status: "success",
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: landRecords,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

// Retrieving a single land record by ID
const getLandRecordById = async (req, res) => {
  try {
    const landRecord = await getLandRecordByIdService(req.params.id);
    return res.status(200).json({
      status: "success",
      message: `መለያ ቁጥር ${req.params.id} ያለው የመሬት መዝገብ በተሳካ ሁኔታ ተገኝቷል።`,
      data: landRecord,
    });
  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
    });
  }
};

// Updating an existing land record
const updateLandRecord = async (req, res) => {
  try {
    const data = req.body.land_record
      ? typeof req.body.land_record === "string"
        ? JSON.parse(req.body.land_record)
        : req.body.land_record
      : req.body;
    const updatedRecord = await updateLandRecordService(
      req.params.id,
      data,
      req.user
    );
    return res.status(200).json({
      status: "success",
      message: `መለያ ቁጥር ${req.params.id} ያለው መዝገብ በተሳካ ሁኔታ ተቀይሯል።`,
      data: updatedRecord,
    });
  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
    });
  }
};

// Deleting a land record
const deleteLandRecord = async (req, res) => {
  try {
    const result = await deleteLandRecordService(req.params.id, req.user);
    return res.status(200).json({
      status: "success",  
      message: result.message,
      data: result.deletedRecord,
    });
  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  createLandRecord,
  getAllLandRecords,
  getLandRecordById,
  updateLandRecord,
  deleteLandRecord,
};
