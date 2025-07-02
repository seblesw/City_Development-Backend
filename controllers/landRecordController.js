const {
  createLandRecordService,
  getAllLandRecordService,
  updateLandRecordService,
  deleteLandRecordService,
} = require("../services/landRecordService");

// Creating a new land record
const createLandRecord = async (req, res, next) => {
  console.log("req.body:", JSON.stringify(req.body, null, 2)); 
  console.log("req.files:", req.files); 
  try {
    const { body, files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }

    // Handle both string and object inputs
    const parseField = (field, fieldName) => {
      if (!field) {
        return fieldName === "co_owners" || fieldName === "documents" ? [] : {};
      }
      if (typeof field === "object") {
        return field; // Already an object, no parsing needed
      }
      if (typeof field !== "string") {
        throw new Error(
          `የ${fieldName} መረጃ ሕብረቁምፊ ወይም ነገር መሆን አለበት። የተገኘው: ${typeof field}`
        );
      }
      try {
        return JSON.parse(field);
      } catch (error) {
        throw new Error(
          `የ${fieldName} መረጃ ትክክለኛ JSON መሆን አለበት።: ${field} ልክ ያልሆነ JSON ነው።`
        );
      }
    };

    const data = {
      primary_user: parseField(body.primary_user, "primary_user"),
      co_owners: parseField(body.co_owners, "co_owners"),
      land_record: parseField(body.land_record, "land_record"),
      documents: parseField(body.documents, "documents"),
      land_payment: parseField(body.land_payment, "land_payment"),
    };

    // Validate required fields
    if (!data.primary_user || !data.land_record || !data.documents) {
      return res
        .status(400)
        .json({
          error:
            "የግዴታ መረጃዎች (primary_user, land_record, documents) መግለጽ አለባቸው።",
        });
    }

    // Validate file uploads
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "ቢያንስ አንዴ ሰነዴ ፋይል መግለጥ አለበት።" });
    }

    const result = await createLandRecordService(data, files, user);
    return res.status(201).json({
      message: "የመሬት መዝገብ በተሳካ ሁኔታ ተፈጥሯል።",
      data: result,
    });
  } catch (error) {
    console.error("Controller error:", error.message); // Log error for debugging
    return res.status(400).json({ error: error.message });
  }
};
// Retrieving all land records
const getAllLandRecords = async (req, res, next) => {
  try {
    const { query } = req;
    const landRecords = await getAllLandRecordService(query);
    return res.status(200).json({
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: landRecords,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Retrieving a single land record by ID
const getLandRecordById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const landRecord = await require("../models").LandRecord.findByPk(id, {
      include: [
        {
          model: require("../models").User,
          as: "user",
          attributes: ["id", "first_name", "last_name", "national_id"],
        },
        {
          model: require("../models").AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: require("../models").User,
          as: "creator",
          attributes: ["id", "first_name", "last_name"],
        },
        {
          model: require("../models").User,
          as: "approver",
          attributes: ["id", "first_name", "last_name"],
        },
      ],
      attributes: [
        "id",
        "parcel_number",
        "land_level",
        "area",
        "land_use",
        "ownership_type",
        "zoning_type",
        "record_status",
        "priority",
        "notification_status",
        "createdAt",
        "updatedAt",
      ],
    });
    if (!landRecord) {
      return res.status(404).json({ error: `መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።` });
    }
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው መዝገብ በተሳካ ሁኔታ ተገኝቷል።`,
      data: landRecord,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Updating an existing land record
const updateLandRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { body, files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const data = body.land_record ? JSON.parse(body.land_record) : body;
    const updatedRecord = await updateLandRecordService(id, data, user);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው መዝገብ በተሳካ �ሁኔታ ተቀይሯል።`,
      data: updatedRecord,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

// Deleting a land record
const deleteLandRecord = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const result = await deleteLandRecordService(id, user);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createLandRecord,
  getAllLandRecords,
  getLandRecordById,
  updateLandRecord,
  deleteLandRecord,
};
