const { sequelize, RECORD_STATUSES } = require("../models");
const fs = require("fs");

const {
  createLandRecordService,
  getAllLandRecordService,
  getLandRecordByIdService,
  updateLandRecordService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  saveLandRecordAsDraftService,
  getDraftLandRecordService,
  submitDraftLandRecordService,
  updateDraftLandRecordService,
  getMyLandRecordsService,
  getLandRecordsByUserAdminUnitService,
  changeRecordStatusService,
  moveToTrashService,
  restoreFromTrashService,
  permanentlyDeleteService,
  getTrashItemsService,
  // importLandRecordsFromCSVService,
  // rejectedLandRecords,
  getRejectedLandRecordsService,
  getLandRecordStats,
  importLandRecordsFromXLSXService,
} = require("../services/landRecordService");

// Creating a new land record
const createLandRecord = async (req, res) => {
  try {
    const user = req.user;

    // Parse string fields from form-data/request body
    const owners = JSON.parse(req.body.owners || "[]");
    const land_record = JSON.parse(req.body.land_record || "{}");
    const documents = JSON.parse(req.body.documents || "[]");
    const land_payment = JSON.parse(req.body.land_payment || "{}");

    // Validate ownership structure
    if (land_record.ownership_category === "የጋራ" && owners.length < 2) {
      return res.status(400).json({
        status: "error",
        message: "የጋራ ባለቤትነት ለመመዝገብ ቢያንስ 2 ባለቤቶች ያስፈልጋሉ።",
      });
    } else if (
      land_record.ownership_category === "የግል" &&
      owners.length !== 1
    ) {
      return res.status(400).json({
        status: "error",
        message: "የግል ባለቤትነት ለመመዝገብ በትክክል 1 ባለቤት ያስፈልጋል።",
      });
    }

    // console.log(req.body);
    const result = await createLandRecordService(
      {
        owners,
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
const importLandRecordsFromXLSX = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    if (!req.file) {
      throw new Error("CSV ፋይል ያስፈልጋል።");
    }

    const results = await importLandRecordsFromXLSXService(
      req.file.path,
      req.user,
      { transaction: t }
    );

    await t.commit();
    fs.unlinkSync(req.file.path); // Cleanup

    res.status(201).json({
      status: "success",
      message: `CSV በተሳካ ሁኔታ ተጭኗል። ${results.createdCount}/${results.totalRows} መዝገቦች ተፈጥረዋል።`,
      data: {
        created: results.createdCount,
        skipped: results.skippedCount,
        errors: results.errors.slice(0, 10), // Show first 10 errors
      },
    });
  } catch (error) {
    await t.rollback();
    if (req.file?.path) fs.unlinkSync(req.file.path);

    res.status(400).json({
      status: "error",
      message: error.message,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};
const saveLandRecordAsDraft = async (req, res) => {
  try {
    const user = req.user;

    // Parse string fields from form-data/request body
    // All fields are optional for drafts
    const primary_user = req.body.primary_user
      ? JSON.parse(req.body.primary_user)
      : {};
    const co_owners = req.body.co_owners ? JSON.parse(req.body.co_owners) : [];
    const land_record = req.body.land_record
      ? JSON.parse(req.body.land_record)
      : {};
    const documents = req.body.documents ? JSON.parse(req.body.documents) : [];
    const land_payment = req.body.land_payment
      ? JSON.parse(req.body.land_payment)
      : {};

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
    const primary_user = req.body.primary_user
      ? JSON.parse(req.body.primary_user)
      : {};
    const co_owners = req.body.co_owners ? JSON.parse(req.body.co_owners) : [];
    const land_record = req.body.land_record
      ? JSON.parse(req.body.land_record)
      : {};
    const documents = req.body.documents ? JSON.parse(req.body.documents) : [];
    const land_payment = req.body.land_payment
      ? JSON.parse(req.body.land_payment)
      : {};

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
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
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
        message: "ድራፍት ውይም ረቂቅ መዝገብ ID ያስፈልጋል።",
      });
    }

    const result = await submitDraftLandRecordService(id, user);

    return res.status(200).json({
      status: "success",
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    // Handle specific error types differently
    if (error.message.includes("Validation failed")) {
      return res.status(422).json({
        status: "validation_error",
        message: error.message.replace("Validation failed: ", ""),
        details: error.message.split("; "),
      });
    } else if (error.message.includes("ተመዝግቧል")) {
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
      return res
        .status(400)
        .json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }

    const records = await getLandRecordByUserIdService(userId);

    res.status(200).json({ status: "success", data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};
//  Retrieving all land records created by the authenticated user to differentiate between user on same role
// This function retrieves all land records created by the user making the request
const getLandRecordsByCreator = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    if (isNaN(userId)) {
      return res
        .status(400)
        .json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }
    const records = await getLandRecordsByCreatorService(userId);
    res.status(200).json({ status: "success", data: records });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "የመሬት መዝገቦችን ማግኘት አልተሳካም።",
    });
  }
};
const getMyLandRecords = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const records = await getMyLandRecordsService(user.id);

    return res.status(200).json({
      status: "success",
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: records,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`,
      code: "error",
    });
  }
};
// Retrieving land records by user and administrative unit
const getLandRecordsByUserAdminUnit = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id || !user.administrative_unit_id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ ወይም የአስተዳደር ክፍል አልተገለጸም። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const records = await getLandRecordsByUserAdminUnitService(
      user.administrative_unit_id
    );

    // Try to get the admin unit name from the first record, fallback if not found
    const adminUnitName =
      records.length > 0 &&
      records[0].administrative_unit &&
      records[0].administrative_unit.name
        ? records[0].administrative_unit.name
        : "አስተዳደር ክፍል";

    return res.status(200).json({
      status: "success",
      count: records.length,
      message: `የ ${adminUnitName} መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።`,
      data: records,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`,
      code: "error",
    });
  }
};
const getRejectedLandRecords = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id || !user.administrative_unit_id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ ወይም የአስተዳደር ክፍል አልተገለጸም። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const records = await getRejectedLandRecordsService(
      user.administrative_unit_id
    );

    // Try to get the admin unit name from the first record, fallback if not found
    const adminUnitName =
      records.length > 0 &&
      records[0].administrative_unit &&
      records[0].administrative_unit.name
        ? records[0].administrative_unit.name
        : "አስተዳደር ክፍል";

    return res.status(200).json({
      status: "success",
      count: records.length,
      message: `የ ${adminUnitName} መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።`,
      data: records,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`,
      code: "error",
    });
  }
};
// Enhanced Controller
const updateLandRecord = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const recordId = req.params.id;

    // Validate inputs
    if (!recordId) {
      throw new Error("የመሬት አይዲ ያስገቡ");
    }
    if (!user?.id) {
      throw new Error("ተጠቃሚው መለያ ቁጥር አልተገለጸም።");
    }

    // Parse and validate request data
    const updateData = {
      owners: req.body.owners
        ? safeJsonParse(req.body.owners, "owners")
        : undefined,
      land_record: req.body.land_record
        ? safeJsonParse(req.body.land_record, "land_record")
        : {},
      documents: req.body.documents
        ? safeJsonParse(req.body.documents, "documents")
        : undefined,
      payments: req.body.payments
        ? safeJsonParse(req.body.payments, "payments")
        : undefined,
    };

    // Validate at least one update field exists
    const hasUpdates = Object.values(updateData).some(
      (field) =>
        field !== undefined && (!Array.isArray(field) || field.length > 0)
    );
    if (!hasUpdates) {
      throw new Error("ቢያንስ አንድ የሚያዘምኑ መረጃ አለብዎት።");
    }

    // Process the update
    const updatedRecord = await updateLandRecordService(
      recordId,
      updateData,
      req.files || [],
      user,
      { transaction: t }
    );

    await t.commit();

    return res.status(200).json({
      status: "success",
      message: "Land record updated successfully",
      data: updatedRecord,
      changes: {
        owners_updated: !!updateData.owners,
        land_record_updated: !!updateData.land_record,
        documents_updated: !!updateData.documents,
        payment_updated: !!updateData.payments,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("Update error:", error);

    const statusCode = getStatusCodeForError(error);
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
      details:
        process.env.NODE_ENV === "development"
          ? {
              stack: error.stack,
              error: error.message,
            }
          : undefined,
    });
  }
};

// Helper function for safe JSON parsing// Helper Functions
const safeJsonParse = (str, fieldName) => {
  try {
    const parsed = JSON.parse(str);
    if (fieldName === "documents" && !Array.isArray(parsed)) {
      throw new Error(`Documents data must be an array`);
    }
    return parsed;
  } catch (e) {
    throw new Error(`Invalid JSON format for ${fieldName}: ${e.message}`);
  }
};

const getStatusCodeForError = (error) => {
  if (error.message.includes("not found")) return 404;
  if (
    error.message.includes("invalid") ||
    error.message.includes("required") ||
    error.message.includes("must be")
  )
    return 400;
  if (
    error.message.includes("unauthorized") ||
    error.message.includes("permission")
  )
    return 403;
  return 500;
};
// Changing the status of a land record
const changeRecordStatus = async (req, res) => {
  try {
    const { record_status, notes, rejection_reason } = req.body;
    const { id: recordId } = req.params;
    const user = req.user;

    // Basic validation
    if (!record_status) {
      return res
        .status(400)
        .json({ status: "error", message: "Record status is required" });
    }

    const updatedRecord = await changeRecordStatusService(
      recordId,
      record_status,
      user.id,
      { notes, rejection_reason }
    );

    res.status(200).json({
      status: "success",
      message: `Record status updated to ${record_status}`,
      data: updatedRecord,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
// trash management
const moveToTrash = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;
    const { deletionReason } = req.body;

    if (!deletionReason) {
      throw new Error("የመሰረዝ ምክንያት ያስፈልጋል።");
    }

    const result = await moveToTrashService(id, user, deletionReason, {
      transaction: t,
    });

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ወደ መጥፎ ቅርጫት ተዛውሯል",
      data: result,
    });
  } catch (error) {
    await t.rollback();
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const restoreFromTrash = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await restoreFromTrashService(id, user, {
      transaction: t,
    });

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ከመጥፎ ቅርጫት ተመልሷል",
      data: result,
    });
  } catch (error) {
    await t.rollback();
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const permanentlyDelete = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

    await permanentlyDeleteService(id, user, { transaction: t });

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ለዘላለም ተሰርዟል",
    });
  } catch (error) {
    await t.rollback();
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

const getTrash = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const user = req.user;

    const result = await getTrashItemsService(user, { page, limit });

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const getLandRecordStatsController = async (req, res, next) => {
  try {
    // Get the admin unit ID from the authenticated user
    const adminUnitId = req.user.administrative_unit_id || null;

    // Get optional transaction from request if needed
    const options = {};
    if (req.transaction) options.transaction = req.transaction;

    const stats = await getLandRecordStats(adminUnitId, options);

    res.status(200).json({
      status: "success",
      message: "የመሬት መዝገብ ስታቲስቲክስ በተሳካ ሁኔታ ተገኝቷል።",
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  moveToTrash,
  getLandRecordStatsController,
  restoreFromTrash,
  permanentlyDelete,
  getTrash,
  createLandRecord,
  importLandRecordsFromXLSX,
  saveLandRecordAsDraft,
  getAllLandRecords,
  changeRecordStatus,
  getRejectedLandRecords,
  getLandRecordById,
  getMyLandRecords,
  getLandRecordByUserId,
  getLandRecordsByCreator,
  updateLandRecord,
  getDraftLandRecord,
  updateDraftLandRecord,
  submitDraftLandRecord,
  getLandRecordsByUserAdminUnit,
};
