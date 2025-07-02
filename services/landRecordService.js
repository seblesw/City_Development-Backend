const {
  sequelize,
  LandRecord,
  User,
  Role,
  AdministrativeUnit,
  RECORD_STATUSES,
  NOTIFICATION_STATUSES,
  PRIORITIES,
  LAND_USE_TYPES,
  ZONING_TYPES,
  OWNERSHIP_TYPES,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");

const createLandRecordService = async (data, files, userId) => {
  console.log("Input data:", JSON.stringify(data, null, 2));
  console.log("Files received:", files);

  let transaction;
  try {
    transaction = await sequelize.transaction();

    // Parse JSON strings
    const primaryUserData =
      typeof data.primary_user === "string"
        ? JSON.parse(data.primary_user)
        : data.primary_user;
    const coOwnersData =
      typeof data.co_owners === "string"
        ? JSON.parse(data.co_owners)
        : data.co_owners || [];
    const landRecordData =
      typeof data.land_record === "string"
        ? JSON.parse(data.land_record)
        : data.land_record;
    const documentsData =
      typeof data.documents === "string"
        ? JSON.parse(data.documents)
        : data.documents || [];
    const landPaymentData =
      typeof data.land_payment === "string"
        ? JSON.parse(data.land_payment)
        : data.land_payment || {};

    console.log("Parsed fields:", {
      primary_user: primaryUserData,
      co_owners: coOwnersData,
      land_record: landRecordData,
      documents: documentsData,
      land_payment: landPaymentData,
    });

    // Validate enum values
    console.log("Enum values:", {
      LAND_USE_TYPES,
      OWNERSHIP_TYPES,
      ZONING_TYPES,
    });
    if (
      !LAND_USE_TYPES ||
      !Object.values(LAND_USE_TYPES).includes(landRecordData.land_use)
    ) {
      throw new Error(
        `የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${
          Object.values(LAND_USE_TYPES || {}).join(", ") || "አልተገለጸም"
        }) ውስጥ መሆን አለበት።`
      );
    }
    if (
      !OWNERSHIP_TYPES ||
      !Object.values(OWNERSHIP_TYPES).includes(landRecordData.ownership_type)
    ) {
      throw new Error(
        `የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${
          Object.values(OWNERSHIP_TYPES || {}).join(", ") || "አልተገለጸም"
        }) ውስጥ መሆን አለበት።`
      );
    }
    if (
      landRecordData.zoning_type &&
      !Object.values(ZONING_TYPES).includes(landRecordData.zoning_type)
    ) {
      throw new Error(
        `የዞን አይነት ከተፈቀዱቷ እሴቶች (${
          Object.values(ZONING_TYPES || {}).join(", ") || "አልተገለጸም"
        }) ውስጥ መሆን አለበት።`
      );
    }



    // Validate creator role
    const creator = await User.findByPk(userId, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!creator || !["መዝጋቢ", "አስተዳደር"].includes(creator.role?.name)) {
      throw new Error("መዝገብ መፍጠር የሚችሉት መዝጋቢ ወይም አስተዳደር ብቻ ናቸው።");
    }

    // Validate administrative unit and land level
    const adminUnit = await AdministrativeUnit.findByPk(
      landRecordData.administrative_unit_id ||
        primaryUserData.administrative_unit_id,
      { transaction }
    );
    if (!adminUnit) {
      throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
    }
    if (landRecordData.land_level > adminUnit.max_land_levels) {
      throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
    }

    // Check for existing land record
    const existingRecord = await LandRecord.findOne({
      where: {
        [Op.or]: [
          {
            parcel_number: landRecordData.parcel_number,
            administrative_unit_id: landRecordData.administrative_unit_id,
          },
          landRecordData.block_number
            ? {
                block_number: landRecordData.block_number,
                administrative_unit_id: landRecordData.administrative_unit_id,
              }
            : null,
        ].filter(Boolean),
        deletedAt: null,
      },
      transaction,
    });
    if (existingRecord) {
      throw new Error("የመሬት ቁጥር ወይም የቦታ ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
    }

    // Create primary user
    console.log("Creating primary user and co-owners...");
    const primaryUser = await userService.registerUserService(
      primaryUserData,
      false,
      transaction
    );
    console.log("Primary user created:", {
      id: primaryUser.id,
      national_id: primaryUser.national_id,
    });

    // Validate primary owner
    if (!primaryUser.id || typeof primaryUser.id !== "number") {
      throw new Error("ተጠቃሚ መታወቂያ ትክክለኛ ቁጥር መሆን አለበት።");
    }
    if (primaryUser.primary_owner_id !== null) {
      throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
    }
    if (
      primaryUser.administrative_unit_id !==
      (landRecordData.administrative_unit_id ||
        primaryUserData.administrative_unit_id)
    ) {
      throw new Error("አስተዳደራዊ ክፍል ከተጠቃሚው ጋር መመሳሰል አለበት።");
    }

    // Only process co-owners if primary user's marital_status is not "ነጠላ"
    let coOwners = [];
    if (primaryUserData.marital_status !== "ነጠላ" && coOwnersData.length > 0) {
      for (const coOwnerData of coOwnersData) {
        coOwnerData.primary_owner_id = primaryUser.id;
        const coOwner = await userService.registerUserService(
          coOwnerData,
          true,
          transaction
        );
        coOwners.push(coOwner);
      }
    } else if (
      primaryUserData.marital_status === "ነጠላ" &&
      coOwnersData.length > 0
    ) {
      throw new Error("የጋራ ባለቤቶች ለነጠላ ተጠቃሚ አያስፈልጉም።");
    }

    // Initialize status_history and action_log
    const now = new Date();
    const status_history = [
      {
        status: RECORD_STATUSES.DRAFT,
        changed_by: userId,
        changed_at: now,
      },
    ];
    const action_log = [
      {
        action: "CREATED",
        changed_by: userId,
        changed_at: now,
      },
    ];

    // Create land record
    console.log("Creating land record with user_id:", primaryUser.id);
    const landRecord = await LandRecord.create(
      {
        ...landRecordData,
        user_id: primaryUser.id,
        administrative_unit_id:
          landRecordData.administrative_unit_id ||
          primaryUserData.administrative_unit_id,
        created_by: userId,
        status: RECORD_STATUSES.DRAFT,
        notification_status: NOTIFICATION_STATUSES.NOT_SENT,
        priority: PRIORITIES.LOW,
        status_history,
        action_log,
      },
      { transaction }
    );

    // Create documents
    const documentPromises = documentsData.map(async (doc, index) => {
      if (files && files[index]) {
        return documentService.createDocument(
          {
            ...doc,
            land_record_id: landRecord.id,
            file_path: files[index].path,
            prepared_by: userId,
          },
          transaction
        );
      }
    });
    await Promise.all(documentPromises.filter(Boolean));

    // Create land payment
    let landPayment = null;
    if (Object.keys(landPaymentData).length > 0) {
      landPayment = await landPaymentService.createPayment(
        {
          ...landPaymentData,
          land_record_id: landRecord.id,
          payer_id: primaryUser.id,
        },
        transaction
      );
    }

    await transaction.commit();

    return {
      landRecord,
      primaryUser,
      coOwners,
      documents: documentsData,
      landPayment,
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Service error:", error.message, error.stack);
    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};
// Retrieving all land records with filtering and pagination
const getAllLandRecordService = async (query) => {
  const where = {};
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const offset = (page - 1) * limit;

  if (query.administrative_unit_id)
    where.administrative_unit_id = parseInt(query.administrative_unit_id);
  if (
    query.record_status &&
    Object.values(RECORD_STATUSES).includes(query.record_status)
  ) {
    where.record_status = query.record_status;
  }
  if (query.priority && Object.values(PRIORITIES).includes(query.priority)) {
    where.priority = query.priority;
  }
  if (
    query.land_use &&
    Object.values(LAND_USE_TYPES).includes(query.land_use)
  ) {
    where.land_use = query.land_use;
  }
  if (
    query.ownership_type &&
    Object.values(OWNERSHIP_TYPES).includes(query.ownership_type)
  ) {
    where.ownership_type = query.ownership_type;
  }
  if (
    query.zoning_type &&
    Object.values(ZONING_TYPES).includes(query.zoning_type)
  ) {
    where.zoning_type = query.zoning_type;
  }
  if (query.parcel_number) where.parcel_number = query.parcel_number;

  try {
    const { count, rows } = await LandRecord.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "last_name", "national_id"],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "last_name"],
        },
        {
          model: User,
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
      limit,
      offset,
    });
    return {
      total: count,
      page,
      limit,
      data: rows,
    };
  } catch (error) {
    throw new Error(`የመዝገቦች መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

// Updating an existing land record
const updateLandRecordService = async (id, data, updater) => {
  if (!updater || !updater.id) {
    throw new Error("የመቀየሪ መረጃ አልተገኘም። ትክክለኛ ማስመሰያ ያክሉ።");
  }

  const transaction = await sequelize.transaction();
  try {
    // Validating updater role
    const updaterRecord = await User.findByPk(updater.id, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!updaterRecord) {
      throw new Error(`መለያ ቁጥር ${updater.id} ያለው መቀየሪ አልተገኘም።`);
    }
    if (!["መዝጋቢ", "አስተዳደር"].includes(updaterRecord.role?.name)) {
      throw new Error("መዝገብ መቀየር የሚችለው መዝጋቢ ወይም አስተዳደር ብቻ ነው።");
    }

    // Finding the land record
    const landRecord = await LandRecord.findByPk(id, { transaction });
    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Validating updatable fields
    const updatableFields = [
      "parcel_number",
      "land_level",
      "administrative_unit_id",
      "user_id",
      "area",
      "north_neighbor",
      "east_neighbor",
      "south_neighbor",
      "west_neighbor",
      "block_number",
      "block_special_name",
      "land_use",
      "ownership_type",
      "coordinates",
      "plot_number",
      "zoning_type",
      "priority",
      "record_status",
      "rejection_reason",
      "notification_status",
    ];
    const updateData = {};
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }
    updateData.updated_by = updater.id;

    // Validating specific fields
    if (
      updateData.land_use &&
      !Object.values(LAND_USE_TYPES).includes(updateData.land_use)
    ) {
      throw new Error(
        `የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${Object.values(LAND_USE_TYPES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.ownership_type &&
      !Object.values(OWNERSHIP_TYPES).includes(updateData.ownership_type)
    ) {
      throw new Error(
        `የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${Object.values(OWNERSHIP_TYPES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.zoning_type &&
      !Object.values(ZONING_TYPES).includes(updateData.zoning_type)
    ) {
      throw new Error(
        `የመሬት ዞን ከተፈቀዱቷ እሴቶች (${Object.values(ZONING_TYPES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.priority &&
      !Object.values(PRIORITIES).includes(updateData.priority)
    ) {
      throw new Error(
        `ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.record_status &&
      !Object.values(RECORD_STATUSES).includes(updateData.record_status)
    ) {
      throw new Error(
        `የመዝገብ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(RECORD_STATUSES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.notification_status &&
      !Object.values(NOTIFICATION_STATUSES).includes(
        updateData.notification_status
      )
    ) {
      throw new Error(
        `የማሳወቂያ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(NOTIFICATION_STATUSES).join(
          ", "
        )}) ውስጥ መሆን አለበት።`
      );
    }

    // Updating the land record
    await landRecord.update(updateData, { transaction });

    await transaction.commit();
    return landRecord;
  } catch (error) {
    await transaction.rollback();
    throw new Error(`የመዝገብ መቀየር ስህተት: ${error.message}`);
  }
};

// Deleting a land record
const deleteLandRecordService = async (id, deleter) => {
  if (!deleter || !deleter.id) {
    throw new Error("የመሰሪ መረጃ አልተገኘም። ትክክለኛ ማስመሰያ ያክሉ።");
  }

  const transaction = await sequelize.transaction();
  try {
    // Validating deleter role
    const deleterRecord = await User.findByPk(deleter.id, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!deleterRecord) {
      throw new Error(`መለያ ቁጥር ${deleter.id} ያለው መሰሪ አልተገኘም።`);
    }
    if (!["አስተዳደር"].includes(deleterRecord.role?.name)) {
      throw new Error("መዝገብ መሰረዝ የሚችለው አስተዳደር ብቻ ነው።");
    }

    // Finding the land record
    const landRecord = await LandRecord.findByPk(id, { transaction });
    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Updating action log before deletion
    landRecord.action_log = [
      ...(landRecord.action_log || []),
      {
        action: "DELETED",
        changed_by: deleter.id,
        changed_at: new Date(),
      },
    ];
    await landRecord.update({ deleted_by: deleter.id }, { transaction });

    // Performing soft delete
    await landRecord.destroy({ transaction });

    await transaction.commit();
    return { message: `መለያ ቁጥር ${id} ያለው መዝገብ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`የመዝገብ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandRecordService,
  getAllLandRecordService,
  updateLandRecordService,
  deleteLandRecordService,
};
