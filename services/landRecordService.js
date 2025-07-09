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
  Document,
  LandPayment,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");

const createLandRecordService = async (data, files, user, options = {}) => {
  const { transaction, isDraftSubmission = false } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const {
      primary_user,
      co_owners = [],
      land_record,
      documents = [],
      land_payment,
    } = data;

    const adminunit = user.administrative_unit_id;
    primary_user.administrative_unit_id = adminunit;
    land_record.administrative_unit_id = adminunit;

    const existingRecord = await LandRecord.findOne({
      where: {
        parcel_number: land_record.parcel_number,
        administrative_unit_id: adminunit,
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });

    if (existingRecord) {
      throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
    }

    // create owner and co-owners
    const { primaryOwner, coOwners } = await userService.createLandOwner(
      primary_user,
      co_owners,
      user.id,
      { transaction: t }
    );

    const now = new Date();
    const status_history = [
      {
        status: isDraftSubmission
          ? RECORD_STATUSES.SUBMITTED
          : RECORD_STATUSES.DRAFT,
        changed_by: user.id,
        changed_at: now,
      },
    ];
    const action_log = [
      {
        action: isDraftSubmission ? "SUBMITTED" : "CREATED",
        changed_by: user.id,
        changed_at: now,
      },
    ];

    const landRecord = await LandRecord.create(
      {
        ...land_record,
        user_id: primaryOwner.id,
        created_by: user.id,
        record_status: isDraftSubmission
          ? RECORD_STATUSES.SUBMITTED
          : RECORD_STATUSES.DRAFT,
        notification_status: NOTIFICATION_STATUSES.NOT_SENT,
        priority: land_record.priority || PRIORITIES.LOW,
        status_history,
        action_log,
        rejection_reason: null,
        approver_id: null,
        coordinates: land_record.coordinates
          ? JSON.stringify(land_record.coordinates)
          : null,
      },
      { transaction: t }
    );

    // Document upload
    if (!Array.isArray(files) || files.length < documents.length) {
      throw new Error("ሁሉንም የመሬት ሰነዶችን እባክዎ ያስገቡ።");
    }

    const documentResults = await Promise.all(
      documents.map((doc, index) => {
        const file = files[index];
        if (!file) {
          throw new Error(`ዶክመንት ${index + 1} የተጠናቀቀ አይደለም።`);
        }
        return documentService.createDocumentService(
          {
            ...doc,
            land_record_id: landRecord.id,
            preparer_name: doc.preparer_name || null,
            approver_name: doc.approver_name || null,
          },
          [file],
          user.id,
          { transaction: t }
        );
      })
    );

    //  doc upload
    landRecord.action_log.push(
      ...documentResults.map((doc) => ({
        action: `DOCUMENT_UPLOADED_${doc.document_type}`,
        changed_by: user.id,
        changed_at: doc.createdAt || now,
        document_id: doc.id,
      }))
    );
    await landRecord.save({ transaction: t });

    // Payment
    const landPayment = await landPaymentService.createLandPaymentService(
      {
        ...land_payment,
        land_record_id: landRecord.id,
        payer_id: primaryOwner.id,
        created_by: user.id,
      },
      { transaction: t }
    );

    await t.commit();

    return {
      landRecord,
      primaryOwner,
      coOwners,
      documents: documentResults,
      landPayment,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};

const saveLandRecordAsDraftService = async (
  data,
  files,
  user,
  options = {}
) => {
  const { transaction, isAutoSave = false } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const {
      draft_id,
      primary_user = {},
      co_owners = [],
      land_record = {},
      documents = [],
      land_payment = {},
    } = data;

    const administrative_unit_id = user.administrative_unit_id;
    const now = new Date();
    let landRecord;
    let primaryOwner = null;
    let coOwners = [];
    let documentResults = [];
    let landPayment = null;

    // 1. Handle Existing Draft Update
    if (draft_id) {
      landRecord = await LandRecord.findOne({
        where: {
          id: draft_id,
          is_draft: true,
          created_by: user.id,
          deletedAt: { [Op.eq]: null },
        },
        include: [
          {
            model: User,
            as: "user", 
            attributes: ["id", "first_name", "last_name", "email"], 
          },
        ],
        transaction: t,
      });

      if (!landRecord) {
        throw new Error("Draft record not found or already submitted");
      }

      // Assign existing primaryOwner from DB
      primaryOwner = landRecord.user;

      // Update draft
      await landRecord.update(
        {
          ...land_record,
          coordinates: land_record.coordinates
            ? JSON.stringify(land_record.coordinates)
            : null,
          updatedAt: now,
          last_auto_save: isAutoSave ? now : null,
        },
        { transaction: t }
      );

      landRecord.action_log.push({
        action: isAutoSave ? "DRAFT_AUTO_SAVED" : "DRAFT_UPDATED",
        changed_by: user.id,
        changed_at: now,
      });

      await landRecord.save({ transaction: t });
    }

    // 2. Handle New Draft Creation
    else {
      if (primary_user) {
        primary_user.administrative_unit_id = administrative_unit_id;
      }
      if (land_record) {
        land_record.administrative_unit_id = administrative_unit_id;
      }

      const status_history = [
        {
          status: RECORD_STATUSES.DRAFT,
          changed_by: user.id,
          changed_at: now,
        },
      ];
      const action_log = [
        {
          action: "DRAFT_CREATED",
          changed_by: user.id,
          changed_at: now,
        },
      ];

      // Create primary owner and co-owners
      if (primary_user && Object.keys(primary_user).length > 0) {
        const ownerResult = await userService.createLandOwner(
          primary_user,
          co_owners,
          user.id,
          { transaction: t }
        );
        primaryOwner = ownerResult.primaryOwner;
        coOwners = ownerResult.coOwners;
      }

      landRecord = await LandRecord.create(
        {
          ...land_record,
          user_id: primaryOwner?.id || null,
          created_by: user.id,
          status: RECORD_STATUSES.DRAFT,
          notification_status: NOTIFICATION_STATUSES.NOT_SENT,
          priority: land_record.priority || PRIORITIES.LOW,
          status_history,
          action_log,
          rejection_reason: null,
          approver_id: null,
          coordinates: land_record.coordinates
            ? JSON.stringify(land_record.coordinates)
            : null,
          is_draft: true,
          last_auto_save: isAutoSave ? now : null,
        },
        { transaction: t }
      );
    }

    // 3. Handle Documents (only process if files are provided)
    if (Array.isArray(files) && files.length > 0 && documents.length > 0) {
      documentResults = await Promise.all(
        documents
          .map((doc, index) => {
            const file = files[index];
            if (!file) return null;

            return documentService.createDocumentService(
              {
                ...doc,
                land_record_id: landRecord.id,
                preparer_name: doc.preparer_name || user.full_name || "Unknown",
                approver_name: doc.approver_name || null,
                is_draft: true,
              },
              [file],
              user.id,
              { transaction: t }
            );
          })
          .filter(Boolean)
      );

      if (documentResults.length > 0) {
        landRecord.action_log.push(
          ...documentResults.map((doc) => ({
            action: `DRAFT_DOCUMENT_UPLOADED_${doc.document_type}`,
            changed_by: user.id,
            changed_at: doc.createdAt || now,
            document_id: doc.id,
          }))
        );
        await landRecord.save({ transaction: t });
      }
    }

    // 4. Handle Payment
    if (
      land_payment &&
      (land_payment.payment_type ||
        land_payment.total_amount ||
        land_payment.paid_amount)
    ) {
      landPayment = await landPaymentService.createLandPaymentService(
        {
          ...land_payment,
          land_record_id: landRecord.id,
          payer_id: primaryOwner?.id || null,
          created_by: user.id,
          is_draft: true,
        },
        { transaction: t }
      );
    }

    await t.commit();

    return {
      success: true,
      draft_id: landRecord.id,
      landRecord,
      primaryOwner,
      coOwners,
      documents: documentResults,
      landPayment,
      saved_at: now,
      isAutoSave,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();

    console.error("Draft save error:", {
      error: error.message,
      stack: error.stack,
      userId: user.id,
      draftId: data.draft_id,
    });

    throw new Error(
      isAutoSave
        ? `አውቶሴብ ስተት: ${error.message}`
        : `የረቂቅ መዝገብ መቀመጥ ስህተት: ${error.message}`
    );
  }
};

const getDraftLandRecordService = async (draftId, userId, options = {}) => {
  const { transaction } = options;

  try {
    const draftRecord = await LandRecord.findOne({
      where: {
        id: draftId,
        is_draft: true,
        created_by: userId,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "user", //  This is the primary owner alias
          attributes: { exclude: ["password"] },
          include: [
            {
              model: User,
              as: "coOwners", //  Get co-owners from primary owner
              attributes: { exclude: ["password"] },
            },
          ],
        },
        {
          model: Document,
          as: "documents",
          where: { is_draft: true },
          required: false,
        },
        {
          model: LandPayment,
          as: "payments",
          where: { is_draft: true },
          required: false,
        },
      ],
      transaction,
    });

    if (!draftRecord) {
      throw new Error("Draft record not found or already submitted");
    }

    // Format coordinates if they exist
    if (draftRecord.coordinates) {
      draftRecord.coordinates = JSON.parse(draftRecord.coordinates);
    }

    const primaryOwner = draftRecord.user?.get({ plain: true });
    const coOwners = primaryOwner?.coOwners || [];

    return {
      success: true,
      data: {
        draft_id: draftRecord.id,
        primary_user: primaryOwner,
        co_owners: coOwners,
        land_record: {
          ...draftRecord.get({ plain: true }),
          coordinates: draftRecord.coordinates,
          user: undefined,
        },
        documents: draftRecord.documents,
        land_payment: draftRecord.payments?.[0] || null,
      },
    };
  } catch (error) {
    throw new Error(`የረቂቅ መዝገብ ለማውጣት ስህተት: ${error.message}`);
  }
};

const updateDraftLandRecordService = async (
  draftId,
  data,
  files,
  user,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Step 1: Check if draft exists
    const existingDraft = await LandRecord.findOne({
      where: {
        id: draftId,
        is_draft: true,
        created_by: user.id,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "user", // This is the primary owner in your model
        },
      ],
      transaction: t,
    });

    if (!existingDraft) {
      throw new Error("Draft record not found or already submitted");
    }

    // Step 2: Ensure payer_id exists
    const primaryOwnerId = data?.primary_user?.id || existingDraft?.user?.id;

    if (data.land_payment && !data.land_payment.payer_id) {
      if (!primaryOwnerId) {
        throw new Error("የክፍያ መፍጠር ስህተት: ትክክለኛ ክፍያ ከፋይ መታወቂያ መግለጽ አለበት።");
      }
      data.land_payment.payer_id = primaryOwnerId;
    }

    // Step 3: Save using existing draft service
    const result = await saveLandRecordAsDraftService(
      { ...data, draft_id: draftId },
      files,
      user,
      { ...options, transaction: t }
    );

    await t.commit();
    return result;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የረቂቅ መዝገብ ማደስ ስህተት: ${error.message}`);
  }
};

const submitDraftLandRecordService = async (draftId, user, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const draftRecord = await LandRecord.findOne({
      where: { id: draftId, is_draft: true, created_by: user.id, deletedAt: { [Op.eq]: null } },
      include: [
        { model: Document, as: "documents", where: { is_draft: true }, required: false },
        { model: LandPayment, as: "payments", where: { is_draft: true }, required: false },
        { model: User, as: "user", attributes: { exclude: ["password"] }, include: [{ model: User, as: "coOwners", attributes: { exclude: ["password"] } }] },
      ],
      transaction: t,
    });

    if (!draftRecord) throw new Error("Draft record not found or already submitted");

    const validationErrors = [];
    if (!draftRecord.parcel_number) validationErrors.push("Parcel number is required");
    if (!draftRecord.user) validationErrors.push("Primary owner information is required");
    if (draftRecord.user.ownership_category === "shared" && !draftRecord.user.coOwners.length) {
      validationErrors.push("የጋራ ባለቤትነት ለመመዝገብ ተጋሪ ባለቤቶች ያስፈልጋሉ።");
    }

    const requiredDocumentTypes = ["የባለቤትነት ሰነድ", "የማስተላለፍ ሰነድ"];
    const existingDocTypes = draftRecord.documents?.map((d) => d.document_type) || [];
    const missingDocs = requiredDocumentTypes.filter((type) => !existingDocTypes.includes(type));
    if (missingDocs.length > 0) validationErrors.push(`Missing required documents: ${missingDocs.join(", ")}`);

    if (!draftRecord.payments || draftRecord.payments.length === 0) {
      validationErrors.push("Payment information is required");
    } else {
      const payment = draftRecord.payments[0];
      if (payment.total_amount <= 0) validationErrors.push("Payment amount must be greater than 0");
    }

    if (validationErrors.length > 0) throw new Error(`Validation failed: ${validationErrors.join("; ")}`);

    const existingRecord = await LandRecord.findOne({
      where: { parcel_number: draftRecord.parcel_number, administrative_unit_id: user.administrative_unit_id, id: { [Op.ne]: draftId }, deletedAt: { [Op.eq]: null } },
      transaction: t,
    });

    if (existingRecord) throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");

    const submissionData = {
      primary_user: { ...draftRecord.user.get({ plain: true }), coOwners: undefined },
      co_owners: draftRecord.user.coOwners?.map((co) => ({ ...co.get({ plain: true }), coOwners: undefined, primaryOwner: undefined })) || [],
      land_record: { ...draftRecord.get({ plain: true }), coordinates: draftRecord.coordinates ? JSON.parse(draftRecord.coordinates) : null, documents: undefined, payments: undefined, user: undefined },
      documents: draftRecord.documents?.map((doc) => doc.get({ plain: true })) || [],
      land_payment: draftRecord.payments?.[0]?.get({ plain: true }) || null,
    };

    const submittedRecord = await createLandRecordService(submissionData, [], user, { transaction: t, isDraftSubmission: true });

    await draftRecord.update(
      {
        is_draft: false,
        status: RECORD_STATUSES.SUBMITTED,
        submitted_at: new Date(),
        action_log: [
          ...(draftRecord.action_log || []),
          { action: "SUBMITTED_FROM_DRAFT", changed_by: user.id, changed_at: new Date(), note: "Converted from draft to official record" },
        ],
      },
      { transaction: t }
    );

    await Promise.all([
      Document.update({ is_draft: false }, { where: { land_record_id: draftId }, transaction: t }),
      LandPayment.update({ is_draft: false }, { where: { land_record_id: draftId }, transaction: t }),
    ]);

    if (!transaction) await t.commit();
    return {
      success: true,
      message: "የመሬት መዝገብ በተሳካ ሁኔታ ከረቂቅ ወደ እውነተኛ መዝገብ ቀርቧል።",
      data: submittedRecord,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የረቂቅ መዝገብ ማስፈጸም ስህተት: ${error.message}`);
  }
};
// Enhanced: Retrieving all land records with advanced filtering, sorting, and aggregated stats
const getAllLandRecordService = async (options = {}) => {
  const { transaction } = options;

  try {
    // Fetch all non-deleted land records
    const rows = await LandRecord.findAll({
      where: { deletedAt: { [Op.eq]: null } }, // Only non-deleted records
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "middle_name", "last_name", "national_id", "email", "ownership_category"],
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
      transaction,
    });

    // Fetch associated documents and payments
    const enrichedRows = await Promise.all(
      rows.map(async (record) => {
        const documents = await documentService.getDocumentsByLandRecordId(record.id, { transaction });
        const payments = await landPaymentService.getPaymentsByLandRecordId(record.id, { transaction });
        return {
          ...record.toJSON(),
          coordinates: record.coordinates ? JSON.parse(record.coordinates) : null,
          documents,
          payments,
        };
      })
    );

    return {
      total: enrichedRows.length,
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
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
            "email",
            "phone_number",
            "address",
          ],
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: [
                "id",
                "first_name",
                "middle_name",
                "last_name",
                "national_id",
                "relationship_type",
                "email",
                "phone_number",
              ],
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
const getLandRecordByUserIdService = async (userId) => {
  try {
    const landRecords = await LandRecord.findAll({
      where: {
        user_id: userId,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
            "email",
            "phone_number",
            "address",
          ],
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: [
                "id",
                "first_name",
                "middle_name",
                "last_name",
                "national_id",
                "relationship_type",
                "email",
                "phone_number",
              ],
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
      order: [["createdAt", "DESC"]],
    });

    if (!landRecords || landRecords.length === 0) {
      return [];
    }

    const enrichedRecords = await Promise.all(
      landRecords.map(async (record) => {
        const documents = await documentService.getDocumentsByLandRecordId(
          record.id
        );
        const payments = await landPaymentService.getPaymentsByLandRecordId(
          record.id
        );
        return {
          ...record.toJSON(),
          documents,
          payments,
        };
      })
    );

    return enrichedRecords;
  } catch (error) {
    throw new Error(`የባለቤት መዝገቦችን ማግኘት ስህተት: ${error.message}`);
  }
};
const getLandRecordsByCreatorService = async (userId) => {
  if (!userId) {
    throw new Error("የተጠቃሚ መለያ ቁጥር አልተሰጠም።");
  }

  try {
    const records = await LandRecord.findAll({
      where: {
        created_by: userId,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["first_name", "middle_name", "last_name", "national_id"],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Enrich with documents and payments
    const enrichedRecords = await Promise.all(
      records.map(async (record) => {
        const documents = await documentService.getDocumentsByLandRecordId(
          record.id
        );
        const payments = await landPaymentService.getPaymentsByLandRecordId(
          record.id
        );

        return {
          ...record.toJSON(),
          documents,
          payments,
        };
      })
    );

    return enrichedRecords;
  } catch (error) {
    throw new Error(`በተጠቃሚው የተፈጠሩ መዝገቦችን ማግኘት ስህተት: ${error.message}`);
  }
};
const getMyLandRecordsService = async (userId, options = {}) => {
  const { transaction } = options;

  try {
    // Fetch land records where the user is the primary owner (user_id)
    // or a co-owner (primary_owner_id in User model)
    const records = await LandRecord.findAll({
      where: {
        [Op.or]: [
          { user_id: userId }, // Primary owner
          {
            user_id: {
              [Op.in]: sequelize.literal(
                `(SELECT id FROM users WHERE primary_owner_id = ${userId} )`
              ),
            },
          }, //
        ],
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "first_name", "middle_name", "last_name", "email", "ownership_category"],
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: ["id", "first_name", "middle_name", "last_name", "relationship_type"],
            },
          ],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: Document,
          as: "documents",
          attributes: ["id", "document_type", "files", "createdAt"],
        },
        {
          model: LandPayment,
          as: "payments",
          attributes: ["id", "payment_type", "total_amount", "paid_amount", "createdAt"],
        },
      ],
      attributes: [
        "id",
        "parcel_number",
        "block_number",
        "land_use",
        "ownership_type",
        "area",
        "record_status",
        "priority",
        "coordinates",
        "administrative_unit_id",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
      transaction,
    });

    return records.map((record) => ({
      id: record.id,
      parcel_number: record.parcel_number,
      block_number: record.block_number,
      land_use: record.land_use,
      ownership_type: record.ownership_type,
      area: record.area,
      status: record.status,
      priority: record.priority,
      coordinates: record.coordinates ? JSON.parse(record.coordinates) : null,
      administrative_unit: record.administrativeUnit ? { id: record.administrativeUnit.id, name: record.administrativeUnit.name } : null,
      primary_owner: record.user
        ? {
            id: record.user.id,
            first_name: record.user.first_name,
            middle_name: record.user.middle_name,
            last_name: record.user.last_name,
            email: record.user.email,
            ownership_category: record.user.ownership_category,
            co_owners: record.user.coOwners || [],
          }
        : null,
      documents: record.documents || [],
      payments: record.payments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  } catch (error) {
    throw new Error(`የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`);
  }
};
// Enhanced: Updating an existing land record
const updateLandRecordService = async (id, data, updater, options = {}) => {
  if (!updater || !updater.id) {
    throw new Error("የመቀየሪ መረጃ አልተገኘም። ትክክለኛ ማስመሰያ ያክሉ።");
  }

  const { transaction } = options;
  let t = transaction || (await sequelize.transaction());
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
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Validate administrative unit and land level if provided
    if (data.administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(
        data.administrative_unit_id,
        { transaction: t }
      );
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
      if (
        data.administrative_unit_id &&
        user.administrative_unit_id !== data.administrative_unit_id
      ) {
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
        updateData[field] =
          field === "coordinates" && data[field]
            ? JSON.stringify(data[field])
            : data[field];
      }
    }
    updateData.updated_by = updater.id;
    updateData.updatedAt = new Date();

    // Validate enum fields
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
      updateData.status &&
      !Object.values(RECORD_STATUSES).includes(updateData.status)
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

    // Check for duplicate parcel_number or block_number
    if (updateData.parcel_number || updateData.block_number) {
      const existingRecord = await LandRecord.findOne({
        where: {
          id: { [Op.ne]: id },
          [Op.or]: [
            updateData.parcel_number
              ? { parcel_number: updateData.parcel_number }
              : null,
            updateData.block_number
              ? { block_number: updateData.block_number }
              : null,
          ].filter(Boolean),
          administrative_unit_id:
            updateData.administrative_unit_id ||
            landRecord.administrative_unit_id,
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
        changes: Object.keys(updateData).filter(
          (key) => key !== "updated_by" && key !== "updatedAt"
        ),
      },
    ];

    // Update the land record
    await landRecord.update(
      {
        ...updateData,
        status_history: landRecord.status_history,
        action_log: landRecord.action_log,
      },
      { transaction: t }
    );

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
    throw new Error("የሚደልተው ሰው መረጃ አልተገኘም። ትክክለኛ ቶክን ያክሉ።");
  }

  const { transaction } = options;
  let t = transaction || (await sequelize.transaction());
  try {
    const deleterRecord = await User.findByPk(deleter.id, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!deleterRecord) {
      throw new Error(`መለያ ቁጥር ${deleter.id} ያለው መሰሪ አልተገኘም።`);
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
    await landRecord.update(
      { deleted_by: deleter.id, deletedAt: now },
      { transaction: t }
    );
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
  saveLandRecordAsDraftService,
  getAllLandRecordService,
  getLandRecordByIdService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  updateLandRecordService,
  deleteLandRecordService,
  getDraftLandRecordService,
  updateDraftLandRecordService,
  submitDraftLandRecordService,
  getMyLandRecordsService,
};
