const {
  createLandRecordService,
  getAllLandRecordService,
  getLandRecordByIdService,
  updateLandRecordService,
  deleteLandRecordService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  saveLandRecordAsDraftService,
  getDraftLandRecordService,
  submitDraftLandRecordService,
  updateDraftLandRecordService,
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
const saveLandRecordAsDraft = async (req, res) => {
  try {
    const user = req.user;

    // Parse string fields from form-data/request body
    // All fields are optional for drafts
    const primary_user = req.body.primary_user ? JSON.parse(req.body.primary_user) : {};
    const co_owners = req.body.co_owners ? JSON.parse(req.body.co_owners) : [];
    const land_record = req.body.land_record ? JSON.parse(req.body.land_record) : {};
    const documents = req.body.documents ? JSON.parse(req.body.documents) : [];
    const land_payment = req.body.land_payment ? JSON.parse(req.body.land_payment) : {};

    const result = await saveLandRecordAsDraftService(
      {
        primary_user,
        co_owners,
        land_record,
        documents,
        land_payment,
      },
      req.files || [],
      user
    );

    return res.status(201).json({
      status: "success",
      message: "የመሬት ረቂቅ መዝገብ በተሳካ ሁኔታ ተቀምጧል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የረቂቅ መዝገብ ስህተት: ${error.message}`,
    });
  }
};
const getDraftLandRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const draftId = req.params.id;

    const result = await getDraftLandRecordService(draftId, userId);

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const updateDraftLandRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Parse string fields from form-data/request body
    const primary_user = req.body.primary_user ? JSON.parse(req.body.primary_user) : {};
    const co_owners = req.body.co_owners ? JSON.parse(req.body.co_owners) : [];
    const land_record = req.body.land_record ? JSON.parse(req.body.land_record) : {};
    const documents = req.body.documents ? JSON.parse(req.body.documents) : [];
    const land_payment = req.body.land_payment ? JSON.parse(req.body.land_payment) : {};

    const result = await updateDraftLandRecordService(
      id,
      {
        primary_user,
        co_owners,
        land_record,
        documents,
        land_payment,
      },
      req.files || [],
      user
    );

    return res.status(200).json({
      status: "success",
      message: "የረቂቅ መዝገብ በተሳካ ሁኔታ ተዘምኗል።",
      data: result
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message
    });
  }
};
const submitDraftLandRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Additional validation for required parameters
    if (!id) {
      return res.status(400).json({
        status: "error",
        message: "የረቂቅ መዝገብ ID ያስፈልጋል።",
      });
    }

    const result = await submitDraftLandRecordService(id, user);

    return res.status(200).json({
      status: "success",
      message: result.message,
      data: result.data
    });
  } catch (error) {
    // Handle specific error types differently
    if (error.message.includes('Validation failed')) {
      return res.status(422).json({
        status: "validation_error",
        message: error.message.replace('Validation failed: ', ''),
        details: error.message.split('; '),
      });
    } else if (error.message.includes('ተመዝግቧል')) {
      return res.status(409).json({
        status: "conflict",
        message: error.message,
      });
    }

    return res.status(400).json({
      status: "error",
      message: error.message,
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
// Retrieving land records by user ID
// This function retrieves all land records associated with a specific user ID
const getLandRecordByUserId = async (req, res) => {
 try {
    const userId = parseInt(req.params.userId); 

    if (isNaN(userId)) {
      return res.status(400).json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }

    const records = await getLandRecordByUserIdService(userId);

    res.status(200).json({ status: "success", data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
//  Retrieving all land records created by the authenticated user
// This function retrieves all land records created by the user making the request
const getLandRecordsByCreator = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    if (isNaN(userId)) {
      return res.status(400).json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }
    const records = await getLandRecordsByCreatorService(userId);
    res.status(200).json({ status: "success", data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message:
      error.message || "የመሬት መዝገቦችን ማግኘት አልተሳካም።",
    }); 
  }
}

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
  saveLandRecordAsDraft,
  getAllLandRecords,
  getLandRecordById,
  getLandRecordByUserId,
  getLandRecordsByCreator,
  updateLandRecord,
  deleteLandRecord,
  getDraftLandRecord,
  updateDraftLandRecord,
  submitDraftLandRecord,
  };
