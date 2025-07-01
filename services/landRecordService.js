const { sequelize, LandRecord, User, Role, AdministrativeUnit, RECORD_STATUSES, NOTIFICATION_STATUSES, PRIORITIES, LAND_USE_TYPES, ZONING_TYPES, OWNERSHIP_TYPES } = require("../models");
const { registerUserService } = require("./userService");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");

// Creating a new land record with associated user, documents, and payment
const createLandRecordService = async (data, files, creator) => {
  console.log("Input data:", JSON.stringify(data, null, 2)); // Detailed debug
  console.log("co_owners received:", data.co_owners); // Specific co_owners debug
  // Validating creator input
  if (!creator || !creator.id) {
    throw new Error("የመዝጋቢ መረጃ አልተገኘም። ትክክለኛ ቶክን ያክሉ።");
  }

  const transaction = await sequelize.transaction();
  try {
    // Validating creator role and administrative unit
    const creatorRecord = await User.findByPk(creator.id, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!creatorRecord) {
      throw new Error(`መለያ ቁጥር ${creator.id} ያለው መዝጋቢ አልተገኘም።`);
    }
    if (!["መዝጋቢ", "አስተዳደር"].includes(creatorRecord.role?.name)) {
      throw new Error("መዝገብ መፍጠር የሚችለው መዝጋቢ ወይም አስተዳደር ብቻ ነው።");
    }
    if (!creatorRecord.administrative_unit_id) {
      throw new Error("የመዝጋቢ አስተዳደራዊ ክፍል መግለጽ አለበት።");
    }

    // Validating input data structure
    if (!data || !data.primary_user || !data.land_record || !data.documents) {
      throw new Error("የግዴታ መረጃዎች (primary_user, land_record, documents) መግለጽ አለባቸው።");
    }

    // Validating primary user fields
    if (
      !data.primary_user.first_name ||
      !data.primary_user.last_name ||
      !data.primary_user.national_id ||
      !data.primary_user.gender ||
      !data.primary_user.marital_status
    ) {
      throw new Error("የዋና ተጠቃሚ መረጃዎች (ስም, የአባት ስም, ብሔራዊ መታወቂያ, ጾታ, የጋብቻ ሁኔታ) መግለጽ አለባቸው።");
    }

    // Validating marital status and co-owners
    const validMaritalStatuses = ["ነጠላ", "ባለትዳር", "ቤተሰብ", "የጋራ ባለቤትነት"];
    if (!validMaritalStatuses.includes(data.primary_user.marital_status)) {
      throw new Error(`የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች (${validMaritalStatuses.join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (data.primary_user.marital_status !== "ነጠላ" && !Array.isArray(data.co_owners)) {
      throw new Error("ለነጠላ ያልሆኑ ተጠቃሚዎች የጋራ ባለቤት መረጃ ዝርዝር መግለጽ አለበት።");
    }

    // Set default empty co_owners if undefined
    data.co_owners = data.co_owners || [];

    // Validating land record fields
    if (
      !data.land_record.parcel_number ||
      !data.land_record.land_level ||
      !data.land_record.area ||
      !data.land_record.land_use ||
      !data.land_record.ownership_type
    ) {
      throw new Error("የመሬት መዝገብ መረጃዎች (parcel_number, land_level, area, land_use, ownership_type) መግለጽ አለባቸው።");
    }
    if (!Object.values(LAND_USE_TYPES).includes(data.land_record.land_use)) {
      throw new Error(`የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${Object.values(LAND_USE_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (!Object.values(OWNERSHIP_TYPES).includes(data.land_record.ownership_type)) {
      throw new Error(`የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${Object.values(OWNERSHIP_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (data.land_record.zoning_type && !Object.values(ZONING_TYPES).includes(data.land_record.zoning_type)) {
      throw new Error(`የመሬት ዞን ከተፈቀዱቷ እሴቶች (${Object.values(ZONING_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (data.land_record.priority && !Object.values(PRIORITIES).includes(data.land_record.priority)) {
      throw new Error(`ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (
      !data.land_record.north_neighbor &&
      !data.land_record.east_neighbor &&
      !data.land_record.south_neighbor &&
      !data.land_record.west_neighbor
    ) {
      throw new Error("ቢያንስ አንድ ጎረቤት መግለጥ አለበት።");
    }

    // Creating primary user and co-owners
    const primaryUserData = {
      first_name: data.primary_user.first_name,
      last_name: data.primary_user.last_name,
      national_id: data.primary_user.national_id,
      email: data.primary_user.email || null,
      phone_number: data.primary_user.phone_number || null,
      gender: data.primary_user.gender,
      marital_status: data.primary_user.marital_status,
      address: data.primary_user.address || null,
      administrative_unit_id: data.primary_user.administrative_unit_id || creatorRecord.administrative_unit_id,
      role_id: null,
      is_active: true,
      co_owners: data.co_owners,
    };
    const { primaryUser, coOwners } = await registerUserService(primaryUserData, { transaction });
    if (!primaryUser) {
      throw new Error("ዋና ተጠቃሚ መፍጠር አልተሳካም።");
    }

    // Creating land record
    const landRecordData = {
      parcel_number: data.land_record.parcel_number,
      land_level: data.land_record.land_level,
      administrative_unit_id: creatorRecord.administrative_unit_id,
      user_id: primaryUser.id,
      area: data.land_record.area,
      north_neighbor: data.land_record.north_neighbor || null,
      east_neighbor: data.land_record.east_neighbor || null,
      south_neighbor: data.land_record.south_neighbor || null,
      west_neighbor: data.land_record.west_neighbor || null,
      block_number: data.land_record.block_number || null,
      block_special_name: data.land_record.block_special_name || null,
      land_use: data.land_record.land_use,
      ownership_type: data.land_record.ownership_type,
      coordinates: data.land_record.coordinates || null,
      plot_number: data.land_record.plot_number || null,
      zoning_type: data.land_record.zoning_type || null,
      priority: data.land_record.priority || PRIORITIES.MEDIUM,
      record_status: RECORD_STATUSES.DRAFT,
      notification_status: NOTIFICATION_STATUSES.NOT_SENT,
      created_by: creator.id,
      status_history: [
        {
          status: RECORD_STATUSES.DRAFT,
          changed_by: creator.id,
          changed_at: new Date(),
        },
      ],
      action_log: [
        {
          action: "CREATED",
          changed_by: creator.id,
          changed_at: new Date(),
        },
      ],
    };
    const landRecord = await LandRecord.create(landRecordData, { transaction });
    if (!landRecord) {
      throw new Error("የመሬት መዝገብ መፍጠር አልተሳካም።");
    }

    // Creating documents
    const documents = [];
    if (files && files.documents && data.documents && Array.isArray(data.documents)) {
      if (data.documents.length === 0) {
        throw new Error("ቢያንስ አንድ ሰነድ መግለጥ አለበት።");
      }
      const fileArray = Array.isArray(files.documents) ? files.documents : [files.documents];
      if (data.documents.length !== fileArray.length) {
        throw new Error("የሰነዶች መረጃ እና ፋይሎች ቁጥር መመሳሰል አለበት።");
      }
      for (let i = 0; i < data.documents.length; i++) {
        if (!data.documents[i].map_number || !data.documents[i].document_type) {
          throw new Error("የሰነድ መረጃዎች (map_number, document_type) መግለጽ አለባቸው።");
        }
        const document = await documentService.createDocument(
          {
            map_number: data.documents[i].map_number,
            document_type: data.documents[i].document_type,
            reference_number: data.documents[i].reference_number || null,
            description: data.documents[i].description || null,
            land_record_id: landRecord.id,
            prepared_by: creator.id,
            approved_by: null,
          },
          [fileArray[i]],
          creator.id,
          { transaction }
        );
        documents.push(document);
      }
    } else {
      throw new Error("ቢያንስ አንዴ ሰነድ እና ፋይል መግለጥ አለበት።");
    }

    // Creating land payment
    let landPayment = null;
    if (data.land_payment) {
      if (!data.land_payment.payment_type || !data.land_payment.total_amount || !data.land_payment.paid_amount) {
        throw new Error("የክፍያ መረጃዎች (payment_type, total_amount, paid_amount) መግለጽ አለባቸው።");
      }
      landPayment = await landPaymentService.createPayment(
        {
          land_record_id: landRecord.id,
          payment_type: data.land_payment.payment_type,
          total_amount: data.land_payment.total_amount,
          paid_amount: data.land_payment.paid_amount,
          currency: data.land_payment.currency || "ETB",
          description: data.land_payment.description || null,
          payer_id: primaryUser.id,
        },
        creator.id,
        { transaction }
      );
    }

    await transaction.commit();
    return { landRecord, primaryUser, coOwners, documents, landPayment };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};


// Retrieving all land records with filtering and pagination
const getAllLandRecordService = async (query) => {
  const where = {};
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const offset = (page - 1) * limit;

  if (query.administrative_unit_id) where.administrative_unit_id = parseInt(query.administrative_unit_id);
  if (query.record_status && Object.values(RECORD_STATUSES).includes(query.record_status)) {
    where.record_status = query.record_status;
  }
  if (query.priority && Object.values(PRIORITIES).includes(query.priority)) {
    where.priority = query.priority;
  }
  if (query.land_use && Object.values(LAND_USE_TYPES).includes(query.land_use)) {
    where.land_use = query.land_use;
  }
  if (query.ownership_type && Object.values(OWNERSHIP_TYPES).includes(query.ownership_type)) {
    where.ownership_type = query.ownership_type;
  }
  if (query.zoning_type && Object.values(ZONING_TYPES).includes(query.zoning_type)) {
    where.zoning_type = query.zoning_type;
  }
  if (query.parcel_number) where.parcel_number = query.parcel_number;

  try {
    const { count, rows } = await LandRecord.findAndCountAll({
      where,
      include: [
        { model: User, as: "user", attributes: ["id", "first_name", "last_name", "national_id"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: User, as: "creator", attributes: ["id", "first_name", "last_name"] },
        { model: User, as: "approver", attributes: ["id", "first_name", "last_name"] },
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
    if (updateData.land_use && !Object.values(LAND_USE_TYPES).includes(updateData.land_use)) {
      throw new Error(`የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${Object.values(LAND_USE_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (updateData.ownership_type && !Object.values(OWNERSHIP_TYPES).includes(updateData.ownership_type)) {
      throw new Error(`የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${Object.values(OWNERSHIP_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (updateData.zoning_type && !Object.values(ZONING_TYPES).includes(updateData.zoning_type)) {
      throw new Error(`የመሬት ዞን ከተፈቀዱቷ እሴቶች (${Object.values(ZONING_TYPES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (updateData.priority && !Object.values(PRIORITIES).includes(updateData.priority)) {
      throw new Error(`ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (updateData.record_status && !Object.values(RECORD_STATUSES).includes(updateData.record_status)) {
      throw new Error(`የመዝገብ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(RECORD_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`);
    }
    if (updateData.notification_status && !Object.values(NOTIFICATION_STATUSES).includes(updateData.notification_status)) {
      throw new Error(`የማሳወቂያ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(NOTIFICATION_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`);
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