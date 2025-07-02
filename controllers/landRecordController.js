const {
  createLandRecordService,
  getAllLandRecordService,
  updateLandRecordService,
  deleteLandRecordService,
} = require("../services/landRecordService");

// Creating a new land record
const createLandRecord = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    console.log("Request files:", req.files);
    console.log("Authenticated user:", req.user);

    const userId = req.user?.id;
    if (!userId || typeof userId !== "number") {
      throw new Error("ተጠቃሚ መታወቂያ ትክክለኛ ቁጥር መሆን አለበት።");
    }

    const result = await createLandRecordService(req.body, req.files, userId);
    return res.status(201).json({
      message: "የመሬት መዝገብ በተሳካ ሁኔታ ተፈጥሯል።",
      data: result,
    });
  } catch (error) {
    console.error("Controller error:", error.message, error.stack);
    return res.status(400).json({
      message: `የመዝገብ መፍጠር ስህተት: ${error.message}`,
    });
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
