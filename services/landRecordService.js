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
  DOCUMENT_TYPES,
  Document,
  LandOwner,
  LandPayment,
  PAYMENT_TYPES,
  PAYMENT_STATUSES,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");
const { parseCSVFile } = require("../utils/csvParser");

const createLandRecordService = async (data, files, user) => {
  const t = await sequelize.transaction();
  
  try {
    const { owners = [], land_record, documents = [], land_payment } = data;
    const adminunit = user.administrative_unit_id;

    // 1. Validate Input Data Structure
    if (!land_record || !land_record.parcel_number || !land_record.ownership_category) {
      throw new Error("የመሬት መሰረታዊ መረጃዎች (parcel_number, ownership_category) አስፈላጊ ናቸው።");
    }

    // 2. Validate Ownership Structure
    if (land_record.ownership_category === "የጋራ" && owners.length < 2) {
      throw new Error("የጋራ ባለቤትነት ለመመዝገብ ቢያንስ 2 ባለቤቶች ያስፈልጋሉ።");
    } else if (land_record.ownership_category === "የግል" && owners.length !== 1) {
      throw new Error("የግል ባለቤትነት ለመመዝገብ በትክክል 1 ባለቤት ያስፈልጋል።");
    }

    // 3. Validate Parcel Number Format
    if (!/^[A-Za-z0-9-]+$/.test(land_record.parcel_number)) {
      throw new Error("የመሬት ቁጥር ፊደል፣ ቁጥር ወይም ሰረዝ ብቻ መያዝ አለበት።");
    }

    // 4. Check for Duplicate Parcel
    const existingRecord = await LandRecord.findOne({
      where: {
        parcel_number: land_record.parcel_number,
        administrative_unit_id: adminunit,
        deletedAt: null
      },
      transaction: t
    });

    if (existingRecord) {
      throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");
    }

    // 5. Create Land Record
    const landRecord = await LandRecord.create({
      ...land_record,
      administrative_unit_id: adminunit,
      created_by: user.id,
      record_status: RECORD_STATUSES.SUBMITTED,
      notification_status: NOTIFICATION_STATUSES.NOT_SENT,
      priority: land_record.priority || PRIORITIES.MEDIUM,
      status_history: [{
        status: RECORD_STATUSES.SUBMITTED,
        changed_by: user.id,
        changed_at: new Date()
      }],
      action_log: [{
        action: "CREATED",
        changed_by: user.id,
        changed_at: new Date()
      }],
    }, { transaction: t });

    // 6. Create and Link Owners
    const createdOwners = await userService.createLandOwner(
      owners,
      adminunit,
      user.id,
      { transaction: t }
    );

    await Promise.all(
      createdOwners.map(owner => 
        LandOwner.create({
          user_id: owner.id,
          land_record_id: landRecord.id,
          ownership_percentage: land_record.ownership_category === "የጋራ" 
            ? (100 / createdOwners.length) 
            : 100,
          verified: true
        }, { transaction: t })
      )
    );

    // 7. Handle Documents
    let documentResults = [];
    if (documents.length > 0) {
      if (!files || files.length !== documents.length) {
        throw new Error("ለእያንዳንዱ ሰነድ ተዛማጅ ፋይል መግባት አለበት።");
      }

      documentResults = await Promise.all(
        documents.map((doc, index) => {
          if (!files[index]?.path) {
            throw new Error(`ለሰነድ ${doc.document_type || index + 1} ፋይል የለም።`);
          }
          
          return documentService.createDocumentService(
            {
              ...doc,
              land_record_id: landRecord.id,
              preparer_name: doc.preparer_name || `${user.first_name} ${user.last_name}`,
              file_path: files[index].path
            },
            [files[index]],
            user.id,
            { transaction: t }
          );
        })
      );
    }

    // 8. Handle Payment
    let landPayment = null;
    if (land_payment && land_payment.total_amount > 0) {
      if (!land_payment.payment_type || !Object.values(PAYMENT_TYPES).includes(land_payment.payment_type)) {
        throw new Error("የክፍያ አይነት ከተፈቀዱት ውስጥ መሆን አለበት።");
      }

      landPayment = await landPaymentService.createLandPaymentService(
        {
          ...land_payment,
          land_record_id: landRecord.id,
          payer_id: createdOwners[0].id,
          created_by: user.id,
          payment_status: land_payment.paid_amount >= land_payment.total_amount
            ? PAYMENT_STATUSES.COMPLETED
            : PAYMENT_STATUSES.PENDING
        },
        { transaction: t }
      );
    }

    await t.commit();
    
    return {
      landRecord,
      owners: createdOwners,
      documents: documentResults,
      landPayment
    };
  } catch (error) {
    await t.rollback();
    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};
const importLandRecordsFromCSVService = async (
  filePath,
  user,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const results = {
      createdCount: 0,
      skippedCount: 0,
      totalRows: 0,
      errors: [],
      errorDetails: [],
    };

    const csvData = await parseCSVFile(filePath);
    results.totalRows = csvData.length;

    console.log(
      "Authenticated user.administrative_unit_id:",
      user.administrative_unit_id,
      typeof user.administrative_unit_id
    );

    // Group rows by parcel_number
    const recordsByParcel = {};
    for (const row of csvData) {
      const parcelNumber =
        row.parcel_number || `unknown_${Math.random().toString(36).slice(2)}`;
      if (!recordsByParcel[parcelNumber]) {
        recordsByParcel[parcelNumber] = [];
      }
      recordsByParcel[parcelNumber].push(row);
    }

    for (const [parcelNumber, rows] of Object.entries(recordsByParcel)) {
      const rowNum =
        csvData.findIndex((r) => r.parcel_number === parcelNumber) + 1;
      let rowTransaction = await sequelize.transaction();
      try {
        // Use the first row for primary user and land data
        const row = rows[0];

        // --- PRIMARY USER ---
        const primary_user = {
          first_name: row.first_name || "መረጃ የለም",
          middle_name: row.middle_name || null,
          last_name: row.last_name || "መረጃ የለም",
          marital_status: row.marital_status || null,
          national_id: String(row.national_id) || null,
          email: row.email?.trim() || null,
          phone_number: row.phone_number || null,
          address: row.address || "መረጃ የለም",
          ownership_category: row.ownership_category || "የግል",
          administrative_unit_id: isNaN(parseInt(user.administrative_unit_id))
            ? null
            : parseInt(user.administrative_unit_id),
        };

        console.log(`Row ${rowNum} primary_user:`, {
          national_id: primary_user.national_id,
          national_id_type: typeof primary_user.national_id,
          phone_number: primary_user.phone_number,
          phone_number_type: typeof primary_user.phone_number,
          administrative_unit_id: primary_user.administrative_unit_id,
          administrative_unit_id_type:
            typeof primary_user.administrative_unit_id,
        });

        // --- LAND RECORD ---
        const land_record = {
          parcel_number: row.parcel_number || null,
          plot_number: row.plot_number || null,
          land_level: parseInt(row.land_level) || 0,
          administrative_unit_id: isNaN(parseInt(user.administrative_unit_id))
            ? null
            : parseInt(user.administrative_unit_id),
          area: parseFloat(row.area) || 0,
          land_use: row.land_use || null,
          zoning_type: row.zoning_type || "የንግድ ማዕከል",
          ownership_type: row.ownership_type || "ግል",
          coordinates: row.coordinates ? JSON.parse(row.coordinates) : null,
          priority: row.priority || "መካከለኛ",
        };

        // --- DOCUMENT ---
        const documents = rows
          .filter((r) => r.document_type)
          .map((r) => ({
            document_type: r.document_type || "ያልተገለጸ",
            map_number: r.document_map_number || null,
            file_path: null,
            reference_number: r.document_reference_number || null,
            description: r.document_description || null,
            issue_date: r.document_issue_date || null,
            preparer_name: r.document_preparer_name || null,
            approver_name: r.document_approver_name || null,
            isActive:
              r.document_is_active === "true" || r.document_is_active === true,
            inActived_reason: r.document_inactived_reason || null,
            is_draft: false,
          }));

        // --- LAND PAYMENT ---
        const land_payment = {
          payment_type: row.payment_type || "የኪራይ ክፍያ",
          total_amount: parseFloat(row.total_amount) || 0,
          paid_amount: parseFloat(row.paid_amount) || 0,
          currency: row.currency || "ETB",
          payment_status: row.payment_status || "PENDING",
          description: row.payment_description || "Imported payment",
        };

        // --- REUSE createLandRecordService ---
        await createLandRecordService(
          { primary_user, co_owners: [], land_record, documents, land_payment },
          [],
          user,
          { transaction: rowTransaction, isImport: true }
        );

        results.createdCount++;
        await rowTransaction.commit();
      } catch (error) {
        results.skippedCount++;
        results.errors.push(`ረድፍ ${rowNum}: ${error.message}`);
        results.errorDetails.push({
          row: rowNum,
          parcel_number: parcelNumber,
          error: error.message,
        });
        await rowTransaction.rollback();
      }
    }

    if (!transaction) await t.commit();
    return results;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`CSV ማስገቢያ አልተሳካም፡ ${error.message}`);
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
        { model: User, as: "user", attributes: ["id", "national_id", "email"] },
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
      transaction: t,
    });

    if (!existingDraft) {
      throw new Error("Draft record not found or already submitted");
    }

    // Step 2: Prepare data
    const {
      primary_user,
      co_owners = [],
      land_record = {},
      documents = [],
      land_payment,
    } = data;

    // Step 3: Update primary owner and co-owners if provided
    let primaryOwnerId = existingDraft.user?.id;
    if (primary_user) {
      const { primaryOwner, coOwners } = await userService.createLandOwner(
        {
          ...primary_user,
          administrative_unit_id: user.administrative_unit_id,
        },
        co_owners,
        user.id,
        { transaction: t }
      );
      primaryOwnerId = primaryOwner.id;
      land_record.user_id = primaryOwnerId;
    }

    // Step 4: Update land record fields
    await existingDraft.update(
      {
        ...land_record,
        user_id: primaryOwnerId || existingDraft.user_id,
        coordinates: land_record.coordinates
          ? JSON.stringify(land_record.coordinates)
          : existingDraft.coordinates,
        updated_by: user.id,
        updatedAt: new Date(),
      },
      { transaction: t }
    );

    // Step 5: Update or create documents
    const documentResults = await Promise.all(
      documents.map(async (doc, index) => {
        const file = files[index];
        if (!file && !doc.file_path) {
          throw new Error(
            `ዶክመንት ${doc.document_type || index + 1} የተጠናቀቀ አይደለም።`
          );
        }
        const docData = {
          ...doc,
          land_record_id: draftId,
          preparer_name: doc.preparer_name || user.full_name || "Unknown",
          approver_name: doc.approver_name || null,
          is_draft: true,
          created_by: user.id,
          updated_by: user.id,
        };
        if (doc.id) {
          // Update existing document
          const existingDoc = await Document.findOne({
            where: {
              id: doc.id,
              land_record_id: draftId,
              is_draft: true,
              deletedAt: { [Op.eq]: null },
            },
            transaction: t,
          });
          if (existingDoc) {
            await existingDoc.update(
              {
                ...docData,
                file_path: file
                  ? file.path
                  : doc.file_path || existingDoc.file_path,
              },
              { transaction: t }
            );
            return existingDoc;
          }
        }
        // Create new document
        return documentService.createDocumentService(docData, [file], user.id, {
          transaction: t,
        });
      })
    );

    // Step 6: Update or create payment
    let landPayment;
    if (land_payment) {
      if (!land_payment.payer_id) {
        land_payment.payer_id = primaryOwnerId || existingDraft.user_id;
        if (!land_payment.payer_id) {
          throw new Error("የክፍያ መፍጠር ስህተት: ትክክለኛ ክፍያ ከፋይ መታወቂያ መግለጽ አለበት።");
        }
      }
      const existingPayment = existingDraft.payments?.[0];
      if (existingPayment) {
        // Update existing payment
        await existingPayment.update(
          {
            ...land_payment,
            land_record_id: draftId,
            payer_id: land_payment.payer_id,
            is_draft: true,
            updated_by: user.id,
            updatedAt: new Date(),
          },
          { transaction: t }
        );
        landPayment = existingPayment;
      } else {
        // Create new payment
        landPayment = await landPaymentService.createLandPaymentService(
          {
            ...land_payment,
            land_record_id: draftId,
            payer_id: land_payment.payer_id,
            created_by: user.id,
            is_draft: true,
          },
          { transaction: t }
        );
      }
    }

    // Step 7: Update action log
    await existingDraft.update(
      {
        action_log: [
          ...(existingDraft.action_log || []),
          {
            action: "DRAFT_UPDATED",
            changed_by: user.id,
            changed_at: new Date(),
            note: "Updated draft with new data",
          },
        ],
      },
      { transaction: t }
    );

    if (!transaction) await t.commit();
    return {
      success: true,
      message: "የረቂቅ መዝገብ በተሳካ ሁኔታ ተዘምኗል።",
      data: {
        landRecord: existingDraft,
        documents: documentResults,
        landPayment,
      },
    };
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
      where: {
        id: draftId,
        is_draft: true,
        created_by: user.id,
        deletedAt: { [Op.eq]: null },
      },
      include: [
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
        {
          model: User,
          as: "user",
          attributes: { exclude: ["password"] },
          include: [
            {
              model: User,
              as: "coOwners",
              attributes: { exclude: ["password"] },
            },
          ],
        },
      ],
      transaction: t,
    });

    if (!draftRecord)
      throw new Error("Draft record not found or already submitted");

    const validationErrors = [];
    if (!draftRecord.parcel_number)
      validationErrors.push("Parcel number is required");
    if (!draftRecord.user)
      validationErrors.push("Primary owner information is required");
    if (
      draftRecord.user.ownership_category === "የጋራ" &&
      !draftRecord.user.coOwners.length
    ) {
      validationErrors.push("የጋራ ባለቤትነት ለመመዝገብ ተጋሪ ባለቤቶች ያስፈልጋሉ።");
    }
    if (
      !draftRecord.documents ||
      draftRecord.documents.length === 0 ||
      !draftRecord.documents.some((doc) => doc.file_path)
    ) {
      validationErrors.push(
        "At least one document with a valid file is required"
      );
    }
    if (!draftRecord.payments || draftRecord.payments.length === 0) {
      validationErrors.push("Payment information is required");
    } else {
      const payment = draftRecord.payments[0];
      if (payment.total_amount <= 0)
        validationErrors.push("Payment amount must be greater than 0");
    }

    if (validationErrors.length > 0)
      throw new Error(`Validation failed: ${validationErrors.join("; ")}`);

    const existingRecord = await LandRecord.findOne({
      where: {
        parcel_number: draftRecord.parcel_number,
        administrative_unit_id: user.administrative_unit_id,
        id: { [Op.ne]: draftId },
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });

    if (existingRecord)
      throw new Error("ይህ የመሬት ቁጥር በዚህ አስተዳደራዊ ክፍል ውስጥ ተመዝግቧል።");

    const submissionData = {
      primary_user: {
        ...draftRecord.user.get({ plain: true }),
        coOwners: undefined,
      },
      co_owners:
        draftRecord.user.coOwners?.map((co) => ({
          ...co.get({ plain: true }),
          coOwners: undefined,
          primaryOwner: undefined,
        })) || [],
      land_record: {
        ...draftRecord.get({ plain: true }),
        coordinates: draftRecord.coordinates
          ? JSON.parse(draftRecord.coordinates)
          : null,
        documents: undefined,
        payments: undefined,
        user: undefined,
      },
      documents:
        draftRecord.documents?.map((doc) => doc.get({ plain: true })) || [],
      land_payment: draftRecord.payments?.[0]?.get({ plain: true }) || null,
    };

    const submittedRecord = await createLandRecordService(
      submissionData,
      [],
      user,
      { transaction: t, isDraftSubmission: true, draftRecordId: draftId }
    );

    await draftRecord.update(
      {
        is_draft: false,
        record_status: RECORD_STATUSES.SUBMITTED, // Fixed field name
        submitted_at: new Date(),
        action_log: [
          ...(draftRecord.action_log || []),
          {
            action: "SUBMITTED_FROM_DRAFT",
            changed_by: user.id,
            changed_at: new Date(),
            note: "Converted from draft to official record",
          },
        ],
      },
      { transaction: t }
    );

    await Promise.all([
      Document.update(
        { is_draft: false },
        { where: { land_record_id: draftId }, transaction: t }
      ),
      LandPayment.update(
        { is_draft: false },
        { where: { land_record_id: draftId }, transaction: t }
      ),
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
//Retrieving all
const getAllLandRecordService = async (options = {}) => {
  const { transaction } = options;

  try {
    // Fetch all non-deleted land records
    const rows = await LandRecord.findAll({
      where: { deletedAt: { [Op.eq]: null } },
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
            "ownership_category",
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
      transaction,
    });

    // Fetch associated documents and payments
    const enrichedRows = await Promise.all(
      rows.map(async (record) => {
        const documents = await documentService.getDocumentsByLandRecordId(
          record.id,
          { transaction }
        );
        const payments = await landPaymentService.getPaymentsByLandRecordId(
          record.id,
          { transaction }
        );
        return {
          ...record.toJSON(),
          coordinates: record.coordinates
            ? JSON.parse(record.coordinates)
            : null,
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
//Retrieving a single land record by ID with full details
const getLandRecordByIdService = async (id, options = {}) => {
  const { transaction, includeDeleted = false } = options;

  try {
    const landRecord = await LandRecord.findOne({
      where: includeDeleted ? { id } : { id, deletedAt: { [Op.eq]: null } },
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
            "ownership_category",
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
                "relationship_type",
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
        "deletedAt", // Include deletedAt in attributes
      ],
      paranoid: !includeDeleted, // Control soft-delete filtering
      transaction,
    });

    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${id} ያለው መዝገብ አልተገኘም።`);
    }

    // Fetch associated documents and payments with same deletion filter
    const documents = await documentService.getDocumentsByLandRecordId(id, {
      includeDeleted,
      transaction,
    });

    const payments = await landPaymentService.getPaymentsByLandRecordId(id, {
      includeDeleted,
      transaction,
    });

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
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "ownership_category",
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
                "relationship_type",
              ],
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
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "createdAt",
          ],
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
      administrative_unit: record.administrativeUnit
        ? {
            id: record.administrativeUnit.id,
            name: record.administrativeUnit.name,
          }
        : null,
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
const getLandRecordsByUserAdminUnitService = async (
  adminUnitId,
  options = {}
) => {
  const { transaction } = options;

  try {
    const records = await LandRecord.findAll({
      where: {
        administrative_unit_id: adminUnitId,
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
            "email",
            "ownership_category",
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
                "relationship_type",
              ],
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
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "createdAt",
          ],
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
      record_status: record.record_status,
      priority: record.priority,
      coordinates: record.coordinates ? JSON.parse(record.coordinates) : null,
      administrative_unit: record.administrativeUnit
        ? {
            id: record.administrativeUnit.id,
            name: record.administrativeUnit.name,
          }
        : null,
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
//Updating an existing land record
const updateLandRecordService = async (
  recordId,
  data,
  files,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // 1. Get the complete land record with all associations
    const existingRecord = await LandRecord.findOne({
      where: { id: recordId, deletedAt: null },
      include: [
        {
          model: User,
          as: "user",
          include: [{ model: User, as: "coOwners" }],
        },
        {
          model: Document,
          as: "documents",
          where: { deletedAt: null },
          required: false,
        },
        {
          model: LandPayment,
          as: "payments",
          where: { deletedAt: null },
          required: false,
        },
      ],
      transaction: t,
    });

    if (!existingRecord) {
      throw new Error("የመሬት መዝገቡ አልተገኘም።");
    }
    // 2. Process document updates
    if (data.documents && data.documents.length > 0) {
      await Promise.all(
        data.documents.map(async (docData, index) => {
          // Get the existing document ID from the land record
          const documentId = existingRecord.documents?.[index]?.id;
          if (!documentId) {
            throw new Error("የሰነድ ID አልተገኘም።");
          }

          // Get files for this document (using index-based matching)
          const file = files[index] ? [files[index]] : [];

          await documentService.updateDocumentService(
            documentId,
            {
              ...docData,
              land_record_id: recordId, // Maintain association
            },
            file,
            updater.id,
            { transaction: t }
          );
        })
      );
    }

    // 3. Process owner updates
    let primaryOwnerId = existingRecord.user_id;
    if (data.primary_user) {
      const { primaryOwner } = await userService.createLandOwner(
        {
          ...data.primary_user,
          administrative_unit_id: existingRecord.administrative_unit_id,
        },
        data.co_owners || [],
        updater.id,
        { transaction: t }
      );
      primaryOwnerId = primaryOwner.id;
    }

    // 4. Update main land record fields
    const updatePayload = {
      ...data.land_record,
      user_id: primaryOwnerId,
      updated_by: updater.id,
    };

    if (data.land_record?.coordinates) {
      updatePayload.coordinates = JSON.stringify(data.land_record.coordinates);
    }

    await existingRecord.update(updatePayload, { transaction: t });

    // 5. Process payment updates
    if (data.land_payment) {
      const paymentId = existingRecord.payments?.[0]?.id;
      if (!paymentId) {
        throw new Error("የክፍያ መረጃ አልተገኘም።");
      }

      await landPaymentService.updateLandPaymentService(
        paymentId,
        {
          ...data.land_payment,
          land_record_id: recordId,
          payer_id: primaryOwnerId,
        },
        updater.id,
        { transaction: t }
      );
    }

    if (!transaction) await t.commit();

    // Return the fully updated record
    return await getLandRecordByIdService(recordId, { transaction: t });
  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error("Update service error:", error);
    throw new Error(`Land record update failed: ${error.message}`);
  }
};

const changeRecordStatusService = async (
  recordId,
  newStatus,
  user,
  notes = null,
  rejectionReason = null,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // 1. Validate input
    if (!Object.values(RECORD_STATUSES).includes(newStatus)) {
      throw new Error("የማያገለግል የመዝገብ ሁኔታ");
    }

    // 2. Get the record with current status
    const record = await LandRecord.findOne({
      where: { id: recordId, deletedAt: null },
      transaction: t,
    });

    if (!record) {
      throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    // 3. Validate status transition
    validateStatusTransition(record.record_status, newStatus);

    // 4. Prepare update data
    const updateData = {
      record_status: newStatus,
      updated_by: user.id,
      status_history: [
        ...(record.status_history || []),
        {
          from: record.record_status,
          to: newStatus,
          changed_by: user.id,
          changed_at: new Date(),
          notes,
        },
      ],
      action_log: [
        ...(record.action_log || []),
        {
          action: `STATUS_CHANGE_${newStatus}`,
          changed_by: user.id,
          changed_at: new Date(),
          notes,
        },
      ],
    };

    // 5. Handle status-specific fields
    if (newStatus === RECORD_STATUSES.REJECTED) {
      updateData.rejection_reason = rejectionReason;
      updateData.rejected_at = new Date();
      updateData.rejected_by = user.id;
    } else if (newStatus === RECORD_STATUSES.APPROVED) {
      updateData.approved_at = new Date();
      updateData.approver_id = user.id;
    }

    // 6. Update the record
    await record.update(updateData, { transaction: t });

    // 7. Handle post-status-change actions
    await handlePostStatusChange(record, newStatus, user, { transaction: t });

    if (!transaction) await t.commit();

    return await getLandRecordByIdService(recordId, { transaction: t });
  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error(`Status change error (${newStatus}):`, error);
    throw error;
  }
};

// Validate allowed status transitions
const validateStatusTransition = (currentStatus, newStatus) => {
  const validTransitions = {
    [RECORD_STATUSES.DRAFT]: [RECORD_STATUSES.SUBMITTED],
    [RECORD_STATUSES.SUBMITTED]: [
      RECORD_STATUSES.UNDER_REVIEW,
      RECORD_STATUSES.REJECTED,
      RECORD_STATUSES.DRAFT,
    ],
    [RECORD_STATUSES.UNDER_REVIEW]: [
      RECORD_STATUSES.APPROVED,
      RECORD_STATUSES.REJECTED,
      RECORD_STATUSES.SUBMITTED,
    ],
    [RECORD_STATUSES.REJECTED]: [
      RECORD_STATUSES.SUBMITTED,
      RECORD_STATUSES.DRAFT,
    ],
    [RECORD_STATUSES.APPROVED]: [], // Final state
  };

  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw new Error(
      `ከ ${currentStatus} ወደ ${newStatus} መሄድ አይቻልም። የተፈቀዱ ሽግግሮች፡ ${
        validTransitions[currentStatus]?.join(", ") || "ምንም"
      }`
    );
  }
};

// Handle post-status-change actions
const handlePostStatusChange = async (record, newStatus, user, options) => {
  const { transaction } = options;

  try {
    switch (newStatus) {
      case RECORD_STATUSES.APPROVED:
        // await generateCertificate(record, user, { transaction });
        // await sendApprovalNotification(record, user, { transaction });
        break;

      case RECORD_STATUSES.REJECTED:
        // await sendRejectionNotification(record, user, { transaction });
        break;

      case RECORD_STATUSES.SUBMITTED:
        // await sendSubmissionNotification(record, user, { transaction });
        break;
    }
  } catch (error) {
    console.error("Post-status-change action failed:", error);
    // Don't rethrow to avoid failing the main transaction
  }
};

// trash management services
const moveToTrashService = async (
  recordId,
  user,
  deletionReason,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const record = await LandRecord.findOne({
      where: { id: recordId, deletedAt: null },
      transaction: t,
    });

    if (!record) {
      throw new Error("መዝገብ አልተገኘም።");
    }

    // Update action log before deletion
    record.action_log = [
      ...(record.action_log || []),
      {
        action: "MOVED_TO_TRASH",
        changed_by: user.id,
        changed_at: new Date(),
        notes: deletionReason,
      },
    ];

    await record.save({ transaction: t });

    // Soft delete
    await record.destroy({ transaction: t });

    // You might want to soft delete associated records too
    await Document.update(
      { deleted_by: user.id },
      { where: { land_record_id: recordId }, transaction: t }
    );

    await LandPayment.update(
      { deleted_by: user.id },
      { where: { land_record_id: recordId }, transaction: t }
    );

    if (!transaction) await t.commit();

    return {
      id: record.id,
      parcel_number: record.parcel_number,
      deleted_at: new Date(),
      deleted_by: user.id,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
  }
};

const restoreFromTrashService = async (recordId, user, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // 1. Find the record including soft-deleted ones
    const record = await LandRecord.findOne({
      where: { id: recordId },
      paranoid: false, // Include soft-deleted records
      transaction: t,
      include: [
        {
          model: Document,
          as: "documents",
          paranoid: false,
        },
        {
          model: LandPayment,
          as: "payments",
          paranoid: false,
        },
      ],
    });

    if (!record) {
      throw new Error("መዝገብ አልተገኘም።");
    }

    if (!record.deletedAt) {
      throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም።");
    }

    // 2. Restore the main record
    await record.restore({ transaction: t });

    // 3. Restore all associated documents
    if (record.documents && record.documents.length > 0) {
      await Promise.all(
        record.documents.map((doc) => doc.restore({ transaction: t }))
      );
    }

    // 4. Restore all associated payments
    if (record.payments && record.payments.length > 0) {
      await Promise.all(
        record.payments.map((payment) => payment.restore({ transaction: t }))
      );
    }

    // 5. Update action log
    record.action_log = [
      ...(record.action_log || []),
      {
        action: "RESTORED_FROM_TRASH",
        changed_by: user.id,
        changed_at: new Date(),
        notes: "Restored from trash",
      },
    ];
    await record.save({ transaction: t });

    if (!transaction) await t.commit();

    // 6. Return the fully restored record with associations
    return await getLandRecordByIdService(recordId, { transaction: t });
  } catch (error) {
    if (!transaction && t) await t.rollback();

    // Convert Sequelize errors to more user-friendly messages
    if (error.name === "SequelizeDatabaseError") {
      throw new Error("የዳታቤዝ ስህተት፡ መልሶ ማስጀመር አልተቻለም።");
    }

    throw new Error(`መልሶ ማስጀመር ስህተት፡ ${error.message}`);
  }
};

const permanentlyDeleteService = async (recordId, user, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const record = await LandRecord.findOne({
      where: { id: recordId },
      paranoid: false,
      transaction: t,
    });

    if (!record) {
      throw new Error("መዝገብ አልተገኘም።");
    }

    if (!record.deletedAt) {
      throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም። በመጀመሪያ ወደ መጥፎ ቅርጫት ይዛውሩት።");
    }

    // Log before permanent deletion
    await AuditLog.create(
      {
        action: "PERMANENTLY_DELETED",
        record_id: recordId,
        user_id: user.id,
        data: JSON.stringify(record.toJSON()),
      },
      { transaction: t }
    );

    // Permanently delete associated records first
    await Document.destroy({
      where: { land_record_id: recordId },
      force: true,
      transaction: t,
    });

    await LandPayment.destroy({
      where: { land_record_id: recordId },
      force: true,
      transaction: t,
    });

    // Permanently delete the main record
    await record.destroy({ force: true, transaction: t });

    if (!transaction) await t.commit();
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
  }
};

const getTrashItemsService = async (user, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  try {
    const { count, rows } = await LandRecord.findAndCountAll({
      where: { deletedAt: { [Op.ne]: null } },
      paranoid: false,
      include: [
        {
          model: User,
          as: "deleter",
          attributes: ["id", "first_name", "last_name"],
        },
      ],
      order: [["deletedAt", "DESC"]],
      limit,
      offset,
    });

    return {
      total: count,
      items: rows.map((record) => ({
        id: record.id,
        parcel_number: record.parcel_number,
        deletedAt: record.deletedAt,
        deleted_by: record.deletedBy,
      })),
      page,
      totalPages: Math.ceil(count / limit),
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  moveToTrashService,
  restoreFromTrashService,
  permanentlyDeleteService,
  getTrashItemsService,
  createLandRecordService,
  importLandRecordsFromCSVService,
  changeRecordStatusService,
  saveLandRecordAsDraftService,
  getAllLandRecordService,
  getLandRecordByIdService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  updateLandRecordService,
  getDraftLandRecordService,
  updateDraftLandRecordService,
  submitDraftLandRecordService,
  getMyLandRecordsService,
  getLandRecordsByUserAdminUnitService,
};
