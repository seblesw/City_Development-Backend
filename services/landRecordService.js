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

const createLandRecordService = async (data, files, user, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());
    const primaryUserData =
      typeof data.primary_user === "string"
        ? JSON.parse(data.primary_user)
        : data.primary_user || {};
    const coOwnersData =
      typeof data.co_owners === "string"
        ? JSON.parse(data.co_owners)
        : data.co_owners || [];
    const landRecordData =
      typeof data.land_record === "string"
        ? JSON.parse(data.land_record)
        : data.land_record || {};
    const documentsData =
      typeof data.documents === "string"
        ? JSON.parse(data.documents)
        : data.documents || [];
    const landPaymentData =
      typeof data.land_payment === "string"
        ? JSON.parse(data.land_payment)
        : data.land_payment || {};
    const requiredFields = [
      "parcel_number",
      "land_level",
      "area",
      "land_use",
      "ownership_type",
      "administrative_unit_id",
    ];
    const missingFields = requiredFields.filter(
      (field) => !landRecordData[field]
    );
    if (missingFields.length > 0) {
      throw new Error(`የሚከተሉት መገለጽ አለባቸው፡ ${missingFields.join(", ")}`);
    }
    if (!Object.values(LAND_USE_TYPES).includes(landRecordData.land_use)) {
      throw new Error(
        `የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${Object.values(LAND_USE_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (!Object.values(OWNERSHIP_TYPES).includes(landRecordData.ownership_type)) {
      throw new Error(
        `የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${Object.values(OWNERSHIP_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      landRecordData.zoning_type &&
      !Object.values(ZONING_TYPES).includes(landRecordData.zoning_type)
    ) {
      throw new Error(
        `የዞን አይነት ከተፈቀዱቷ እሴቶች (${Object.values(ZONING_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    const adminUnit = await AdministrativeUnit.findByPk(
      landRecordData.administrative_unit_id,
      { transaction: t }
    );
    if (!adminUnit) {
      throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
    }
    if (landRecordData.land_level > adminUnit.max_land_levels) {
      throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
    }
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
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });
    if (existingRecord) {
      throw new Error("የመሬት ቁጥር ወይም የቦታ ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
    }
    const { primaryOwner, coOwners } = await userService.createLandOwner(
      primaryUserData,
      coOwnersData,
      user.id,
      { transaction: t }
    );
    if (!primaryOwner.id || typeof primaryOwner.id !== "number") {
      throw new Error("የዋና ባለቤት መለያ ትክክለኛ ቁጥር መሆን አለበት።");
    }
    if (primaryOwner.primary_owner_id !== null) {
      throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
    }
    if (
      primaryOwner.administrative_unit_id !== landRecordData.administrative_unit_id
    ) {
      throw new Error("የዋና ባለቤት አስተዳደራዊ ክፍል ከመሬቱ አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።");
    }
    if (primaryUserData.marital_status === "ነጠላ" && coOwnersData.length > 0) {
      throw new Error("የጋራ ባለቤቶች ላላገባ ባለይዞታ አያስፈልጉም።");
    }
    const now = new Date();
    const status_history = [
      {
        status: RECORD_STATUSES.DRAFT,
        changed_by: user.id,
        changed_at: now,
      },
    ];
    const action_log = [
      {
        action: "CREATED",
        changed_by: user.id,
        changed_at: now,
      },
    ];
    const landRecord = await LandRecord.create(
      {
        ...landRecordData,
        user_id: primaryOwner.id,
        administrative_unit_id: landRecordData.administrative_unit_id,
        created_by: user.id,
        status: RECORD_STATUSES.DRAFT,
        notification_status: NOTIFICATION_STATUSES.NOT_SENT,
        priority: landRecordData.priority || PRIORITIES.LOW,
        status_history,
        action_log,
        north_neighbor: landRecordData.north_neighbor || null,
        east_neighbor: landRecordData.east_neighbor || null,
        south_neighbor: landRecordData.south_neighbor || null,
        west_neighbor: landRecordData.west_neighbor || null,
        block_number: landRecordData.block_number || null,
        block_special_name: landRecordData.block_special_name || null,
        coordinates: landRecordData.coordinates
          ? JSON.stringify(landRecordData.coordinates)
          : null,
        plot_number: landRecordData.plot_number || null,
        rejection_reason: null,
        approver_id: null,
      },
      { transaction: t }
    );
    const documentPromises = documentsData
      .map((doc, index) => {
        if (files && Array.isArray(files) && files[index]) {
          return documentService.createDocumentService(
            {
              ...doc,
              land_record_id: landRecord.id,
              preparer_name:
                doc.preparer_name || user.full_name || "Unknown Preparer",
              approver_name: doc.approver_name || null,
            },
            [files[index]],
            user.id,
            { transaction: t }
          );
        }
        return null;
      })
      .filter(Boolean);
    const documents = await Promise.all(documentPromises);
    landRecord.action_log = [
      ...landRecord.action_log,
      ...documents.map((doc) => ({
        action: `DOCUMENT_UPLOADED_${doc.document_type}`,
        changed_by: user.id,
        changed_at: doc.createdAt || new Date(),
        document_id: doc.id,
      })),
    ];
    await landRecord.save({ transaction: t });
    let landPayment = null;
    if (Object.keys(landPaymentData).length > 0) {
      landPayment = await landPaymentService.createLandPaymentService(
        {
          ...landPaymentData,
          land_record_id: landRecord.id,
          payer_id: primaryOwner.id,
          created_by: user.id,
        },
        { transaction: t }
      );
    }
    await t.commit();
    return {
      landRecord,
      primaryOwner,
      coOwners,
      documents,
      landPayment,
    };
  } catch (error) {
    if (t) await t.rollback();
    throw new Error(`የመዝገብ መፍጠር �ስህተት: ${error.message}`);
  }
};

// Enhanced: Retrieving all land records with advanced filtering, sorting, and aggregated stats
const getAllLandRecordService = async (query) => {
  const where = { deletedAt: { [Op.eq]: null } }; // Only non-deleted records
  const page = parseInt(query.page) || 1;
  const limit = parseInt(query.limit) || 10;
  const offset = (page - 1) * limit;
  const order = [];

  // Enhanced filtering
  if (query.administrative_unit_id) {
    where.administrative_unit_id = parseInt(query.administrative_unit_id);
  }
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
  if (query.parcel_number) {
    where.parcel_number = { [Op.iLike]: `%${query.parcel_number}%` }; // Partial match
  }
  if (query.start_date && query.end_date) {
    where.createdAt = {
      [Op.between]: [new Date(query.start_date), new Date(query.end_date)],
    };
  }

  // Sorting options
  if (query.sort_by) {
    const sortField = query.sort_by === 'created_at' ? 'createdAt' :
                     query.sort_by === 'area' ? 'area' :
                     query.sort_by === 'priority' ? 'priority' : 'createdAt';
    const sortOrder = query.sort_order === 'desc' ? 'DESC' : 'ASC';
    order.push([sortField, sortOrder]);
  } else {
    order.push(['createdAt', 'DESC']); // Default sort
  }

  try {
    // Fetch records with associated data
    const { count, rows } = await LandRecord.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "middle_name", "last_name", "national_id", "email"],
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: ["id", "first_name", "middle_name", "last_name", "national_id", "relationship_type"],
            },
          ],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "max_land_levels"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "middle_name", "last_name"],
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
        "status_history",
        "action_log",
        "north_neighbor",
        "east_neighbor",
        "south_neighbor",
        "west_neighbor",
        "block_number",
        "block_special_name",
        "plot_number",
        "coordinates",
        "rejection_reason",
        "createdAt",
        "updatedAt",
      ],
      limit,
      offset,
      order,
    });

    // Fetch associated documents and payments
    const enrichedRows = await Promise.all(
      rows.map(async (record) => {
        const documents = await documentService.getDocumentsByLandRecordId(record.id);
        const payments = await landPaymentService.getPaymentsByLandRecordId(record.id);
        return {
          ...record.toJSON(),
          documents,
          payments,
        };
      })
    );

    // Aggregate statistics (avoid anything related to status, use record_status instead)
    const stats = await LandRecord.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_records'],
        [sequelize.fn('SUM', sequelize.col('area')), 'total_area'],
        [sequelize.literal(`COUNT(CASE WHEN record_status = '${RECORD_STATUSES.DRAFT}' THEN 1 END)`), 'draft_count'],
        [sequelize.literal(`COUNT(CASE WHEN record_status = '${RECORD_STATUSES.APPROVED}' THEN 1 END)`), 'approved_count'],
        [sequelize.literal(`COUNT(CASE WHEN record_status = '${RECORD_STATUSES.REJECTED}' THEN 1 END)`), 'rejected_count'],
      ],
      raw: true,
    });

    return {
      total: count,
      page,
      limit,
      stats: stats[0],
      data: enrichedRows,
    };
  } catch (error) {
    throw new Error(`የመዝገቦች መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

// New: Retrieving a single land record by ID with full details
const getLandRecordByIdService = async (id) => {
  try {
    const landRecord = await LandRecord.findOne({
      where: { id, deletedAt: { [Op.eq]: null } },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "middle_name", "last_name", "national_id", "email", "phone_number", "address"],
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: ["id", "first_name", "middle_name", "last_name", "national_id", "relationship_type", "email", "phone_number"],
            },
          ],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "max_land_levels"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "middle_name", "last_name"],
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
        "status",
        "priority",
        "notification_status",
        "status_history",
        "action_log",
        "north_neighbor",
        "east_neighbor",
        "south_neighbor",
        "west_neighbor",
        "block_number",
        "block_special_name",
        "plot_number",
        "coordinates",
        "rejection_reason",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Fetch associated documents and payments
    const documents = await documentService.getDocumentsByLandRecordId(id);
    const payments = await landPaymentService.getPaymentsByLandRecordId(id);

    return {
      ...landRecord.toJSON(),
      documents,
      payments,
    };
  } catch (error) {
    throw new Error(`የመዝገብ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

// Enhanced: Updating an existing land record
const updateLandRecordService = async (id, data, updater, options = {}) => {
  if (!updater || !updater.id) {
    throw new Error("የመቀየሪ መረጃ አልተገኘም። ትክክለኛ ማስመሰያ ያክሉ።");
  }

  const { transaction } = options;
  let t = transaction || await sequelize.transaction();
  try {
    const updaterRecord = await User.findByPk(updater.id, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!updaterRecord) {
      throw new Error(`መለያ ቁጥር ${updater.id} ያለው መቀየሪ አልተገኘም።`);
    }
    if (!["መዝጋቢ", "አስተዳደር"].includes(updaterRecord.role?.name)) {
      throw new Error("መዝገብ መቀየር የሚችለው መዝጋቢ ወይም አስተዳደር ብቻ ነው።");
    }

    const landRecord = await LandRecord.findByPk(id, { transaction: t });
    if (!landRecord) {
      throw new Error(`መለ�YA ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Validate administrative unit and land level if provided
    if (data.administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(data.administrative_unit_id, { transaction: t });
      if (!adminUnit) {
        throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
      }
      if (data.land_level && data.land_level > adminUnit.max_land_levels) {
        throw new Error("የመሬት ደረጃ ከአስተዳደራዊ ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
      }
    }

    // Validate user_id if provided
    if (data.user_id) {
      const user = await User.findByPk(data.user_id, { transaction: t });
      if (!user || user.primary_owner_id !== null) {
        throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
      }
      if (data.administrative_unit_id && user.administrative_unit_id !== data.administrative_unit_id) {
        throw new Error("የባለቤት አስተዳደራዊ ክፍል ከመሬቱ አስተዳደራዊ ክፍል ጋር መመሳሰል አለበት።");
      }
    }

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
      "status",
      "rejection_reason",
      "notification_status",
    ];
    const updateData = {};
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = field === 'coordinates' && data[field] ? JSON.stringify(data[field]) : data[field];
      }
    }
    updateData.updated_by = updater.id;
    updateData.updatedAt = new Date();

    // Validate enum fields
    if (updateData.land_use && !Object.values(LAND_USE_TYPES).includes(updateData.land_use)) {
      throw new Error(
        `የመሬት አጠቃቀም ከተፈቀዱቷ እሴቶች (${Object.values(LAND_USE_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (updateData.ownership_type && !Object.values(OWNERSHIP_TYPES).includes(updateData.ownership_type)) {
      throw new Error(
        `የባለቤትነት አይነት ከተፈቀዱቷ እሴቶች (${Object.values(OWNERSHIP_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (updateData.zoning_type && !Object.values(ZONING_TYPES).includes(updateData.zoning_type)) {
      throw new Error(
        `የመሬት ዞን ከተፈቀዱቷ እሴቶች (${Object.values(ZONING_TYPES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (updateData.priority && !Object.values(PRIORITIES).includes(updateData.priority)) {
      throw new Error(
        `ቅድሚያ ከተፈቀዱቷ እሴቶች (${Object.values(PRIORITIES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (updateData.status && !Object.values(RECORD_STATUSES).includes(updateData.status)) {
      throw new Error(
        `የመዝገብ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(RECORD_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }
    if (
      updateData.notification_status &&
      !Object.values(NOTIFICATION_STATUSES).includes(updateData.notification_status)
    ) {
      throw new Error(
        `የማሳወቂያ ሁኔታ ከተፈቀዱቷ እሴቶች (${Object.values(NOTIFICATION_STATUSES).join(", ")}) ውስጥ መሆን አለበት።`
      );
    }

    // Check for duplicate parcel_number or block_number
    if (updateData.parcel_number || updateData.block_number) {
      const existingRecord = await LandRecord.findOne({
        where: {
          id: { [Op.ne]: id },
          [Op.or]: [
            updateData.parcel_number ? { parcel_number: updateData.parcel_number } : null,
            updateData.block_number ? { block_number: updateData.block_number } : null,
          ].filter(Boolean),
          administrative_unit_id: updateData.administrative_unit_id || landRecord.administrative_unit_id,
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingRecord) {
        throw new Error("የመሬት ቁጥር ወይም የቦታ ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
      }
    }

    // Update status_history and action_log
    const now = new Date();
    if (updateData.status && updateData.status !== landRecord.status) {
      landRecord.status_history = [
        ...(landRecord.status_history || []),
        {
          status: updateData.status,
          changed_by: updater.id,
          changed_at: now,
        },
      ];
    }
    landRecord.action_log = [
      ...(landRecord.action_log || []),
      {
        action: "UPDATED",
        changed_by: updater.id,
        changed_at: now,
        changes: Object.keys(updateData).filter(key => key !== 'updated_by' && key !== 'updatedAt'),
      },
    ];

    // Update the land record
    await landRecord.update({ ...updateData, status_history: landRecord.status_history, action_log: landRecord.action_log }, { transaction: t });

    // Fetch associated data for response
    const updatedRecord = await getLandRecordByIdService(id);

    if (!transaction) await t.commit();
    return updatedRecord;
  } catch (error) {
    if (!transaction) await t.rollback();
    throw new Error(`የመዝገብ መቀየር ስህተት: ${error.message}`);
  }
};

// Enhanced: Deleting a land record
const deleteLandRecordService = async (id, deleter, options = {}) => {
  if (!deleter || !deleter.id) {
    throw new Error("የመሰሪ መረጃ አልተገኘም። ትክክለኛ ማስመሰያ ያክሉ።");
  }

  const { transaction } = options;
  let t = transaction || await sequelize.transaction();
  try {
    const deleterRecord = await User.findByPk(deleter.id, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!deleterRecord) {
      throw new Error(`መለያ ቁጥር ${deleter.id} ያለው መሰሪ አልተገኘም።`);
    }
    if (!["አስተዳደር"].includes(deleterRecord.role?.name)) {
      throw new Error("መዝገብ መሰረዝ የሚችለው አስተዳደር ብቻ ነው።");
    }

    const landRecord = await LandRecord.findByPk(id, { transaction: t });
    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Fetch record details before deletion
    const recordDetails = await getLandRecordByIdService(id);

    // Update action log
    const now = new Date();
    landRecord.action_log = [
      ...(landRecord.action_log || []),
      {
        action: "DELETED",
        changed_by: deleter.id,
        changed_at: now,
      },
    ];

    // Perform soft delete
    await landRecord.update({ deleted_by: deleter.id, deletedAt: now }, { transaction: t });
    await landRecord.destroy({ transaction: t });

    if (!transaction) await t.commit();
    return {
      message: `መለያ ቁጥር ${id} ያለው መዝገብ በተሳካ ሁኔታ ተሰርዟል።`,
      deletedRecord: recordDetails,
    };
  } catch (error) {
    if (!transaction) await t.rollback();
    throw new Error(`የመዝገብ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandRecordService,
  getAllLandRecordService,
  getLandRecordByIdService,
  updateLandRecordService,
  deleteLandRecordService,
};