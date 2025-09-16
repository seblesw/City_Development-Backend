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
const { sendEmail } = require("../utils/statusEmail");
const XLSX = require("xlsx");
const{fs}=require("fs");
// const {pLimit} = require("p-limit");
// import pLimit from "p-limit";


const createLandRecordService = async (data, files, user) => {
  const t = await sequelize.transaction();

  try {
    const { owners = [], land_record, documents = [], land_payment } = data;
    const adminunit = user.administrative_unit_id;

    // 1. Enhanced Input Validation
    const validateInputs = () => {
      if (!land_record?.parcel_number || !land_record?.ownership_category) {
        throw new Error(
          "የመሬት መሰረታዊ መረጃዎች (parcel_number, ownership_category) አስፈላጊ ናቸው።"
        );
      }

      // if (land_record.ownership_category === "የጋራ" && owners.length < 2) {
      //   throw new Error("የጋራ ባለቤትነት ለመመዝገብ ቢያንስ 2 ባለቤቶች ያስፈልጋሉ።");
      // } else if (
      //   land_record.ownership_category === "የግል" &&
      //   owners.length !== 1
      // ) {
      //   throw new Error("የግል ባለቤትነት ለመመዝገብ በትክክል 1 ባለቤት ያስፈልጋል።");
      // }
    };

    validateInputs();

    // 2. Check for Duplicate Parcel
    const existingRecord = await LandRecord.findOne({
      where: {
        parcel_number: land_record.parcel_number,
        administrative_unit_id: adminunit,
        deletedAt: null,
      },
      transaction: t,
    });

    if (existingRecord) {
      throw new Error("ይህ የመሬት ቁጥር በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።");
    }

    // 3. Process Profile Pictures (NEW IMPLEMENTATION)
    const processOwnerPhotos = () => {
      // Handle both array and single file upload
      const profilePictures = Array.isArray(files?.profile_picture)
        ? files.profile_picture
        : files?.profile_picture
        ? [files.profile_picture]
        : [];

      return owners.map((owner, index) => ({
        ...owner,
        profile_picture: profilePictures[index]?.serverRelativePath || null,
      }));
    };

    const ownersWithPhotos = processOwnerPhotos();

    // 4. Create Land Record
    const landRecord = await LandRecord.create(
      {
        ...land_record,
        administrative_unit_id: adminunit,
        created_by: user.id,
        record_status: RECORD_STATUSES.SUBMITTED,
        notification_status: NOTIFICATION_STATUSES.NOT_SENT,
        priority: land_record.priority || PRIORITIES.MEDIUM,
        status_history: [
          {
            status: RECORD_STATUSES.SUBMITTED,
            changed_by: {
              id: user.id,
              name: [user.first_name,user.last_name, user.middle_name ]
                .filter(Boolean)
                .join(" "),
            },
            changed_at: new Date(),
          },
        ],
        action_log: [
          {
            action: "CREATED",
            changed_by: {
              id: user.id,
              name: [user.first_name,user.last_name, user.middle_name]
                .filter(Boolean)
                .join(" "),
            },
            changed_at: new Date(),
          },
        ],
      },
      { transaction: t }
    );

    // 5. Create and Link Owners
    const createdOwners = await userService.createLandOwner(
      ownersWithPhotos.map((owner) => ({
        ...owner,
        email: owner.email?.trim() || null,
        address: owner.address?.trim() || null,
        administrative_unit_id: adminunit,
      })),
      adminunit,
      user.id,
      { transaction: t }
    );

    await Promise.all(
      createdOwners.map((owner) =>
        LandOwner.create(
          {
            user_id: owner.id,
            land_record_id: landRecord.id,
            ownership_percentage:
              land_record.ownership_category === "የጋራ"
                ? 100 / createdOwners.length
                : 100,
            verified: true,
            created_at: new Date(),
          },
          { transaction: t }
        )
      )
    );

    // 6. Handle Documents
    const processDocuments = async () => {
      if (!documents.length) return [];

      const filesArr = Array.isArray(files?.documents) ? files.documents : [];

      return Promise.all(
        documents.map((doc, index) => {
          const file = filesArr[index];
          return documentService.createDocumentService(
            {
              ...doc,
              land_record_id: landRecord.id,
              file_path: file?.serverRelativePath || null,
            },
            file ? [file] : [],
            user.id,
            { transaction: t }
          );
        })
      );
    };

    const documentResults = await processDocuments();

    // 7. Handle Payment
    let landPayment = null;
    if (
      land_payment &&
      (land_payment.total_amount > 0 || land_payment.paid_amount > 0)
    ) {
      // Only validate if payment data exists
      if (!land_payment.payment_type) {
        throw new Error(
          "Payment type is required when providing payment information"
        );
      }

      landPayment = await landPaymentService.createLandPaymentService(
        {
          ...land_payment,
          land_record_id: landRecord.id,
          payer_id: createdOwners[0].id,
          created_by: user.id,
          payment_status: calculatePaymentStatus(land_payment),
        },
        { transaction: t }
      );
    }

    // const landPayment = await processPayment();

    await t.commit();

    return {
      landRecord: landRecord.toJSON(),
      owners: createdOwners.map((o) => o.toJSON()),
      documents: documentResults,
      landPayment: landPayment?.toJSON(),
    };
  } catch (error) {
    await t.rollback();

    // Cleanup uploaded files if transaction fails remove file
    if (files) {
      const cleanupFiles = Object.values(files).flat();
      cleanupFiles.forEach((file) => {
        try {
          if (file.path) fs.unlinkSync(file.path);
        } catch (cleanupError) {
          console.error("File cleanup failed:", cleanupError);
        }
      });
    }

    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};

const importLandRecordsFromXLSXService = async (
  filePath,
  user,
  options = {}
) => {
  const { transaction, progressCallback } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    if (!user?.administrative_unit_id) {
      throw new Error("የተጠቃሚው administrative_unit_id አልተገኘም።");
    }

    const adminUnitId = user.administrative_unit_id;
    const results = {
      createdCount: 0,
      skippedCount: 0,
      totalRows: 0,
      errors: [],
      errorDetails: [],
    };

    // Send progress update
    if (progressCallback) {
      progressCallback(5, "Parsing XLSX file...");
    }

    // 1. Parse and validate XLSX
    const xlsxData = await parseAndValidateXLSX(filePath);
    results.totalRows = xlsxData.length;

    // Send progress update
    if (progressCallback) {
      progressCallback(15, "Grouping data by parcel and plot numbers...");
    }

    // 2. Group rows by parcel_number + plot_number
    const recordsGrouped = groupXLSXRows(xlsxData);
    const totalGroups = Object.keys(recordsGrouped).length;
    let processedGroups = 0;

    // Send progress update
    if (progressCallback) {
      progressCallback(20, `Found ${totalGroups} unique parcels to process...`);
    }

    // 3. Process each group
    for (const [groupKey, rows] of Object.entries(recordsGrouped)) {
      const rowTransaction = await sequelize.transaction();
      const primaryRow = rows[0];

      // Ensure rowNum is available for error handling
      const rowNum =
        xlsxData.findIndex(
          (r) =>
            r.parcel_number === primaryRow.parcel_number &&
            r.plot_number === primaryRow.plot_number
        ) + 1;

      try {
        // Send progress update
        if (progressCallback) {
          const groupProgress = 20 + Math.floor((processedGroups / totalGroups) * 75);
          progressCallback(
            groupProgress, 
            `Processing parcel ${primaryRow.parcel_number}, plot ${primaryRow.plot_number}...`
          );
        }

        const { owners, landRecordData, documents, payments } =
          await transformXLSXData(rows, adminUnitId);

        await createLandRecordService(
          {
            land_record: landRecordData,
            owners,
            documents,
            land_payment: payments[0] || null,
          },
          [],
          user,
          {
            transaction: rowTransaction,
            isImport: true,
          }
        );

        results.createdCount++;
        await rowTransaction.commit();
      } catch (error) {
        await rowTransaction.rollback();
        handleImportError(error, primaryRow, rowNum, results);
        
        // Send error progress update
        if (progressCallback) {
          progressCallback(
            -1, 
            `Error processing parcel ${primaryRow.parcel_number}: ${error.message}`
          );
        }
      }
      
      processedGroups++;
    }

    // Send completion progress update
    if (progressCallback) {
      progressCallback(
        100, 
        `Import completed. ${results.createdCount} records created, ${results.skippedCount} skipped.`
      );
    }

    if (!transaction) await t.commit();
    return results;
  } catch (error) {
    // Send error progress update
    if (progressCallback) {
      progressCallback(0, `Import failed: ${error.message}`);
    }
    
    if (!transaction) await t.rollback();
    throw new Error(`XLSX import failed: ${error.message}`);
  }
};

// ------------------ Enhanced Helper Functions ------------------

async function parseAndValidateXLSX(filePath) {
  try {
    // Using xlsx library to parse the file
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON
    const xlsxData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null, 
      // dateNF: "DD/MM/YYYY", 
    });

    // Validate data
    const validatedData = xlsxData.filter((row, index) => {
      if (!row.parcel_number || !row.plot_number) {
        throw new Error(
          `ሮው ${index + 2} የ ፓርሴል ቁጥር እና የካርታ ቁጥር መያዝ አለበት።`
        );
      }
      return true;
    });

    return validatedData;
  } catch (error) {
    throw new Error(`ፋይሉን ፓርስ ማድረግ አልተቻለም: ${error.message}`);
  }
}

function groupXLSXRows(xlsxData) {
  try {
    return xlsxData.reduce((groups, row) => {
      const key = `${row.parcel_number}_${row.plot_number}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
      return groups;
    }, {});
  } catch (error) {
    throw new Error(`ሮው በቡድን መመደብ አልተቻለም: ${error.message}`);
  }
}

async function transformXLSXData(rows, adminUnitId) {
  try {
    const primaryRow = rows[0];
    const ownershipCategory = primaryRow.ownership_category?.trim();

    // Validate required fields
    if (!primaryRow.parcel_number || !primaryRow.plot_number) {
      throw new Error("የ ፓርሴል ቁጥር እና የካርታ ቁጥር መያዝ አለበት።");
    }

    if (!primaryRow.land_use || !primaryRow.ownership_type) {
      throw new Error("የይዞታ አግባብ እና የ መሬት አገልግሎት መያዝ አለበት።");
    }

    // 1. Prepare Owners
    let owners = [];
    if (ownershipCategory === "የጋራ") {
      owners = rows.map((row, index) => {
        if (!row.first_name || !row.middle_name) {
          throw new Error(`ተጋሪ ${index + 1} ሙሉ ስም ያስፈልጋል።`);
        }
        
        return {
          first_name: row.first_name || "Unknown",
          middle_name: row.middle_name || "unknown",
          last_name: row.last_name || "Unknown",
          national_id: row.national_id ? String(row.national_id).trim() : null,
          email: row.email?.trim() || null,
          phone_number: row.phone_number || null,
          gender: row.gender || null,
          relationship_type: row.relationship_type || null,
          address: row.address || null,
        };
      });
    } else if (ownershipCategory === "የግል") {
      if (!primaryRow.first_name || !primaryRow.middle_name) {
        throw new Error("ዋና ባለቤት ሙሉ ስም ያስፈልጋል።");
      }
      
      owners.push({
        first_name: primaryRow.first_name || "Unknown",
        middle_name: primaryRow.middle_name || "unknown",
        last_name: primaryRow.last_name || "Unknown",
        national_id: primaryRow.national_id
          ? String(primaryRow.national_id).trim()
          : null,
        email: primaryRow.email?.trim() || null,
        gender: primaryRow.gender || null,
        phone_number: primaryRow.phone_number || null,
        relationship_type: primaryRow.relationship_type || null,
      });
    } else {
      throw new Error(`የተሳሳተ የይዞታ ምድብ: ${ownershipCategory}`);
    }

    // 2. Prepare Land Record
    const landRecordData = {
      parcel_number: primaryRow.parcel_number,
      land_level: parseInt(primaryRow.land_level) || 1,
      area: parseFloat(primaryRow.area) || 0,
      administrative_unit_id: adminUnitId,
      north_neighbor: primaryRow.north_neighbor || null,
      east_neighbor: primaryRow.east_neighbor || null,
      south_neighbor: primaryRow.south_neighbor || null,
      west_neighbor: primaryRow.west_neighbor || null,
      land_use: primaryRow.land_use,
      ownership_type: primaryRow.ownership_type,
      lease_ownership_type: primaryRow.lease_ownership_type || null,
      zoning_type: primaryRow.zoning_type || null,
      priority: primaryRow.priority || null,
      block_number: primaryRow.block_number || null,
      block_special_name: primaryRow.block_special_name || null,
      ownership_category: ownershipCategory,
      remark: primaryRow.remark || null,
    };

    // 3. Prepare Documents (one shared for የጋራ, first row only)
    const documentRows = ownershipCategory === "የጋራ" ? [primaryRow] : rows;

    const documents = documentRows.map((row) => ({
      document_type: DOCUMENT_TYPES.TITLE_DEED,
      plot_number: row.plot_number,
      approver_name: row.approver_name || null,
      preparer_name: row.preparer_name || null,
      reference_number: row.reference_number,
      description: row.description || null,
      issue_date: row.issue_date ? new Date(row.issue_date) : null,
      files: [],
    }));

    // 4. Prepare Payments (one shared for የጋራ, from first row only)
    const paymentRows = ownershipCategory === "የጋራ" ? [primaryRow] : rows;

    const payments = paymentRows
      .filter((row) => row.payment_type)
      .map((row) => ({
        payment_type: row.payment_type || PAYMENT_TYPES.TAX,
        total_amount: parseFloat(row.total_amount) || 0,
        paid_amount: parseFloat(row.paid_amount) || 0,
        currency: row.currency || "ETB",
        payment_status: calculatePaymentStatus(row),
        description: row.payment_description || "ከ XLSX ተመጣጣኝ ክፍያ",
      }));

    return { owners, landRecordData, documents, payments };
  } catch (error) {
    throw new Error(`Failed to transform XLSX data: ${error.message}`);
  }
}

function calculatePaymentStatus(row) {
  try {
    const total = parseFloat(row.total_amount) || 0;
    const paid = parseFloat(row.paid_amount) || 0;

    if (paid >= total) return "ተጠናቋል";
    if (paid > 0 && paid < total) return "በመጠባበቅ ላይ";
    return "አልተከፈለም";
  } catch (error) {
    return "አልተከፈለም"; 
  }
}

function handleImportError(error, row, rowNum, results) {
  const errorMsg = `Row ${rowNum} (${row.parcel_number}): ${error.message}`;
  results.skippedCount++;
  results.errors.push(errorMsg);
  results.errorDetails.push({
    row: rowNum,
    parcel_number: row.parcel_number,
    plot_number: row.plot_number,
    error: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });

  console.error("Import error:", {
    parcel_number: row.parcel_number,
    plot_number: row.plot_number,
    error: error.message,
  });
}

//save drafts
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
            attributes: [
              "id",
              "first_name",
              "middle_name",
              "last_name",
              "email",
            ],
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
  const {
    transaction,
    includeDeleted = false,
    page = 1,
    pageSize = 50,
    filters = {},
  } = options;

  const t = transaction || (await sequelize.transaction());
  const offset = (page - 1) * pageSize;

  try {
    // 1. Build the base query
    const whereClause = {
      ...filters,
      ...(!includeDeleted && { deletedAt: null }),
    };

    // 2. Fetch land records with optimized includes
    const { count, rows } = await LandRecord.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "owners",
          through: {
            attributes: [],
            where: includeDeleted ? {} : { deletedAt: null },
          },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
            "email",
          ],
          paranoid: !includeDeleted,
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
        // Include documents directly
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "document_type",
            "reference_number",
            "files",
            "issue_date",
            "isActive",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          paranoid: !includeDeleted,
          limit: 5, // Only get recent documents
        },
        // Include payments directly
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "currency",
            "payment_status",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          paranoid: !includeDeleted,
          limit: 5, // Only get recent payments
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
        "ownership_category",
        "notification_status",
        "status_history",
        "action_log",
        "north_neighbor",
        "east_neighbor",
        "south_neighbor",
        "west_neighbor",
        "block_number",
        "block_special_name",
        "rejection_reason",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      order: [["createdAt", "DESC"]],
      distinct: true, // Important for correct counting with includes
      offset,
      limit: pageSize,
      paranoid: !includeDeleted,
      transaction: t,
    });

    // 3. Process the results
    const processedRecords = rows.map((record) => {
      const recordData = record.toJSON();

      // Parse coordinates if they exist
      if (recordData.coordinates) {
        try {
          recordData.coordinates = JSON.parse(recordData.coordinates);
        } catch (e) {
          recordData.coordinates = null;
        }
      }

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      return recordData;
    });

    // 4. Commit transaction if we created it
    if (!transaction) await t.commit();

    return {
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      data: processedRecords,
    };
  } catch (error) {
    // 5. Rollback transaction if we created it
    if (!transaction && t) await t.rollback();

    console.error("Error fetching land records:", {
      error: error.message,
      stack: error.stack,
      filters,
      page,
      pageSize,
    });

    throw new Error(`Failed to retrieve land records: ${error.message}`);
  }
};
//Retrieving a single land record by ID with full details
const getLandRecordByIdService = async (id, options = {}) => {
  const { transaction, includeDeleted = false } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // 1. Fetch land record with optimized includes
    const landRecord = await LandRecord.findOne({
      where: { id },
      include: [
        // Owners through the join table
        {
          model: User,
          as: "owners",
          through: {
            attributes: [],
            where: includeDeleted ? {} : { deletedAt: null },
          },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
            "email",
            "phone_number",
            "profile_picture",
            "address",
          ],
          paranoid: !includeDeleted,
        },
        // Administrative unit
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "type", "unit_level", "max_land_levels"],
        },
        // Creator info
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        // Approver info
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        // Include documents directly
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "document_type",
            "reference_number",
            "issue_date",
            "isActive",
            "files",
            "createdAt",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          paranoid: !includeDeleted,
        },
        // Include payments directly
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "currency",
            "payment_status",
            "description",
            "createdAt",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          paranoid: !includeDeleted,
        },
      ],
      attributes: [
        "id",
        "parcel_number",
        "land_level",
        "area",
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "ownership_category",
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
        "rejection_reason",
        "remark",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      paranoid: !includeDeleted,
      transaction: t,
      rejectOnEmpty: false, 
    });

    if (!landRecord) {
      throw new Error(`Land record with ID ${id} not found`);
    }

    // 2. Process the record data
    const result = landRecord.toJSON();

    // 3. Add calculated fields if needed
    result.total_payments =
      result.payments?.reduce(
        (sum, payment) => sum + parseFloat(payment.paid_amount),
        0
      ) || 0;

    // 4. Commit transaction if we created it
    if (!transaction) await t.commit();

    return result;
  } catch (error) {
    // 5. Rollback transaction if we created it
    if (!transaction && t) await t.rollback();

    console.error("Error fetching land record:", {
      id,
      error: error.message,
      stack: error.stack,
    });

    throw new Error(
      includeDeleted
        ? `መዝገብ ማግኘት አልተቻለም: ${error.message}`
        : `መዝገብ ማግኘት አልተቻለም ወይ ተደልቷል: ${error.message}`
    );
  }
};
const getLandRecordByUserIdService = async (userId) => {
  const transaction = await sequelize.transaction();
  try {
    // 1. Fetch land records with optimized includes
    const landRecords = await LandRecord.findAll({
      where: {
        [Op.or]: [
          { created_by: userId },
          { "$owners.id$": userId }, // Check through the join table
        ],
        deletedAt: null,
      },
      include: [
        // Owners through the join table
        {
          model: User,
          as: "owners",
          through: { attributes: [] }, // Exclude join table attributes
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
        },
        // Administrative unit
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "max_land_levels"],
        },
        // Creator info
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        // Approver info
        {
          model: User,
          as: "approver",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        // Include documents directly
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "document_type",
            "reference_number",
            "issue_date",
            "isActive",
            "createdAt",
          ],
          where: { isActive: true },
          required: false,
        },
        // Include payments directly
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "currency",
            "payment_status",
            "createdAt",
          ],
          required: false,
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
        "rejection_reason",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
      transaction,
    });

    if (!landRecords || landRecords.length === 0) {
      await transaction.commit();
      return [];
    }

    // 2. Process records in a single pass
    const processedRecords = landRecords.map((record) => {
      const recordJson = record.toJSON();

      // Transform documents if needed
      if (recordJson.documents) {
        recordJson.documents = recordJson.documents.map((doc) => ({
          ...doc,
          // Add any document transformations here
        }));
      }

      // Transform payments if needed
      if (recordJson.payments) {
        recordJson.payments = recordJson.payments.map((payment) => ({
          ...payment,
          // Add any payment transformations here
        }));
      }

      return recordJson;
    });

    await transaction.commit();
    return processedRecords;
  } catch (error) {
    await transaction.rollback();
    console.error("Error fetching land records:", {
      userId,
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to retrieve land records: ${error.message}`);
  }
};
const getLandRecordsByCreatorService = async (userId, options = {}) => {
  if (!userId) throw new Error("User ID is required");

  const { transaction, page = 1, pageSize = 10 } = options;
  const t = transaction || (await sequelize.transaction());
  const offset = (page - 1) * pageSize;

  try {
    // Fetch records with optimized includes
    const { count, rows: records } = await LandRecord.findAndCountAll({
      where: {
        created_by: userId,
        deletedAt: null,
      },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [] },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
          ],
          required: false,
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        // Include documents directly
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "document_type",
            "reference_number",
            "createdAt",
          ],
          where: { deletedAt: null },
          required: false,
          limit: 3, // Get only 3 most recent documents
        },
        // Include payments directly
        {
          model: LandPayment,
          as: "payments",
          attributes: ["id", "payment_type", "paid_amount", "createdAt"],
          where: { deletedAt: null },
          required: false,
          limit: 3, // Get only 3 most recent payments
        },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit: pageSize,
      distinct: true, // For correct counting
      transaction: t,
    });

    // Process records
    const processedRecords = records.map((record) => {
      const recordData = record.toJSON();

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      return recordData;
    });

    if (!transaction) await t.commit();

    return {
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      data: processedRecords,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error("Error fetching creator records:", {
      userId,
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to get records by creator: ${error.message}`);
  }
};
const getMyLandRecordsService = async (userId, options = {}) => {
  const {
    transaction,
    page = 1,
    pageSize = 10,
    includeDeleted = false,
  } = options;
  const t = transaction || (await sequelize.transaction());
  const offset = (page - 1) * pageSize;

  try {
    // 1. First find all land records where user is an owner
    const userLandRecords = await LandRecord.findAll({
      attributes: ["id"],
      include: [
        {
          model: User,
          as: "owners",
          through: { where: { user_id: userId } },
          attributes: [],
          required: true,
        },
      ],
      transaction: t,
      raw: true,
    });

    const landRecordIds = userLandRecords.map((record) => record.id);
    if (landRecordIds.length === 0) {
      await t.commit();
      return {
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        data: [],
      };
    }

    // 2. Fetch complete records with all owners
    const { count, rows } = await LandRecord.findAndCountAll({
      where: {
        id: { [Op.in]: landRecordIds },
        ...(!includeDeleted && { deletedAt: null }),
      },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [] },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone_number",
            "national_id",
          ],
          paranoid: !includeDeleted,
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "document_type",
            "reference_number",
            "files",
            "createdAt",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          limit: 3,
          paranoid: !includeDeleted,
        },
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "currency",
            "payment_status",
            "createdAt",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          limit: 3,
          paranoid: !includeDeleted,
        },
      ],
      order: [["createdAt", "DESC"]],
      distinct: true,
      offset,
      limit: pageSize,
      paranoid: !includeDeleted,
      transaction: t,
    });
    // (records)

    // 3. Process and transform the data
    const processedRecords = rows.map((record) => {
      const recordData = record.toJSON();

      // Mark the logged-in user among owners
      const owners = (recordData.owners || []).map((owner) => ({
        ...owner,
        is_current_user: owner.id === userId,
      }));

      // Parse coordinates safely
      try {
        recordData.coordinates = recordData.coordinates
          ? JSON.parse(recordData.coordinates)
          : null;
      } catch (e) {
        recordData.coordinates = null;
      }

      // Calculate payment summary
      const paymentSummary = recordData.payments?.reduce(
        (acc, payment) => {
          acc.total += parseFloat(payment.total_amount || 0);
          acc.paid += parseFloat(payment.paid_amount || 0);
          return acc;
        },
        { total: 0, paid: 0, balance: 0 }
      );

      if (paymentSummary) {
        paymentSummary.balance = paymentSummary.total - paymentSummary.paid;
      }

      return {
        ...recordData,
        owners,
        payment_summary: paymentSummary,
        administrative_unit: recordData.administrativeUnit || null,
        documents: recordData.documents || [],
        payments: recordData.payments || [],
      };
    });

    if (!transaction) await t.commit();

    return {
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      data: processedRecords,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();

    console.error("Error fetching user land records:", {
      userId,
      error: error.message,
      stack: error.stack,
    });

    throw new Error(`Failed to get user land records: ${error.message}`);
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
        // record_status: RECORD_STATUSES.REJECTED,
        administrative_unit_id: adminUnitId,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: ["ownership_percentage", "verified"] },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone_number",
            "national_id",
          ],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "max_land_levels"],
        },
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "document_type",
            "files",
            "plot_number",
            "createdAt",
          ],
        },
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "payment_status",
            "currency",
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
        "ownership_category",
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
      ownership_category: record.ownership_category,
      administrative_unit: record.administrativeUnit
        ? {
            id: record.administrativeUnit.id,
            name: record.administrativeUnit.name,
            max_land_levels: record.administrativeUnit.max_land_levels,
          }
        : null,
      owners: record.owners
        ? record.owners.map((owner) => ({
            ...owner.get({ plain: true }),
            ownership_percentage: owner.LandOwner.ownership_percentage,
            verified: owner.LandOwner.verified,
          }))
        : [],
      documents: record.documents || [],
      payments: record.payments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  } catch (error) {
    throw new Error(`የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`);
  }
};
const getRejectedLandRecordsService = async (adminUnitId, options = {}) => {
  const { transaction } = options;

  try {
    const records = await LandRecord.findAll({
      where: {
        record_status: RECORD_STATUSES.REJECTED,
        administrative_unit_id: adminUnitId,
        deletedAt: { [Op.eq]: null },
      },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: ["ownership_percentage", "verified"] },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone_number",
            "national_id",
          ],
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "max_land_levels"],
        },
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "document_type",
            "files",
            "plot_number",
            "createdAt",
          ],
        },
        {
          model: LandPayment,
          as: "payments",
          attributes: [
            "id",
            "payment_type",
            "total_amount",
            "paid_amount",
            "payment_status",
            "currency",
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
        "ownership_category",
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
      ownership_category: record.ownership_category,
      administrative_unit: record.administrativeUnit
        ? {
            id: record.administrativeUnit.id,
            name: record.administrativeUnit.name,
            max_land_levels: record.administrativeUnit.max_land_levels,
          }
        : null,
      owners: record.owners
        ? record.owners.map((owner) => ({
            ...owner.get({ plain: true }),
            ownership_percentage: owner.LandOwner.ownership_percentage,
            verified: owner.LandOwner.verified,
          }))
        : [],
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
          through: { attributes: [] },
          as: "owners",
          where: { deletedAt: null },
          required: false,
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
      throw new Error("Land record not found");
    }

    // Process land record updates if provided
    if (data.land_record && Object.keys(data.land_record).length > 0) {
      const previousStatus = existingRecord.record_status;
      const newStatus = RECORD_STATUSES.SUBMITTED;

      // Track changes for logging
      const changes = {};
      Object.keys(data.land_record).forEach((key) => {
        if (
          existingRecord[key] !== data.land_record[key] &&
          key !== "updated_at" &&
          key !== "created_at"
        ) {
          changes[key] = {
            from: existingRecord[key],
            to: data.land_record[key],
          };
        }
      });

      // Prepare update payload
      const updatePayload = {
        ...data.land_record,
        updated_by: updater.id,
        record_status: newStatus,
      };

      // Update status history if status changed
      if (newStatus !== previousStatus) {
        const currentStatusHistory = Array.isArray(
          existingRecord.status_history
        )
          ? existingRecord.status_history
          : [];

        updatePayload.status_history = [
          ...currentStatusHistory,
          {
            status: newStatus,
            changed_at: new Date(),
            changed_by: updater.id,
            notes: data.land_record.status_notes || null,
          },
        ];
      }

      await existingRecord.update(updatePayload, { transaction: t });

      // Always log the land record update action
      const currentLog = Array.isArray(existingRecord.action_log)
        ? existingRecord.action_log
        : [];
      const newLog = [
        ...currentLog,
        {
          action: "LAND_RECORD_UPDATED",
          changes: Object.keys(changes).length > 0 ? changes : undefined,
          status_change:
            newStatus !== previousStatus
              ? {
                  from: previousStatus,
                  to: newStatus,
                }
              : undefined,
          changed_by: updater.id,
          changed_at: new Date(),
        },
      ];

      await LandRecord.update(
        { action_log: newLog },
        {
          where: { id: recordId },
          transaction: t,
        }
      );
    }

    // 3. Process owner updates (if owners array provided)
    if (data.owners && data.owners.length > 0) {
      await userService.updateLandOwnersService(
        recordId,
        existingRecord.owners,
        data.owners,
        updater,
        { transaction: t }
      );
    }

    // 4. Process document updates (if documents array provided)
    if (data.documents && data.documents.length > 0) {
      await documentService.updateDocumentsService(
        recordId,
        existingRecord.documents,
        data.documents,
        files || [],
        updater,
        { transaction: t }
      );
    }

    // 5. Process payment updates (if payment data provided)
    if (data.payments && data.payments.length > 0) {
      await landPaymentService.updateLandPaymentsService(
        recordId,
        existingRecord.payments,
        data.payments,
        updater,
        { transaction: t }
      );
    }

    if (!transaction) await t.commit();

    // Return the fully updated record with fresh associations
    return await getLandRecordByIdService(recordId, {
      transaction: t,
      includeAll: true,
    });
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`Land record update failed: ${error.message}`);
  }
};

const changeRecordStatusService = async (
  recordId,
  newStatus,
  userId,
  { notes = null, rejection_reason = null } = {}
) => {
  const t = await sequelize.transaction();

  try {
    // 1. Get the record with owners
    const record = await LandRecord.findByPk(recordId, {
      transaction: t,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name", "email"],},
        {
          model: User,
          as: "owners",
          through: { attributes: [] },
          attributes: ["id", "first_name", "last_name", "middle_name", "email"],
        },
      ],
    });

    if (!record) {
      await t.rollback();
      throw new Error("Land record not found");
    }

    // 2. Validate status transition
    const allowedTransitions = {
      [RECORD_STATUSES.DRAFT]: [RECORD_STATUSES.SUBMITTED],
      [RECORD_STATUSES.SUBMITTED]: [
        RECORD_STATUSES.UNDER_REVIEW,
        RECORD_STATUSES.REJECTED,
      ],
      [RECORD_STATUSES.UNDER_REVIEW]: [
        RECORD_STATUSES.APPROVED,
        RECORD_STATUSES.REJECTED,
      ],
      [RECORD_STATUSES.REJECTED]: [RECORD_STATUSES.SUBMITTED],
      [RECORD_STATUSES.APPROVED]: [],
    };

    if (!allowedTransitions[record.record_status]?.includes(newStatus)) {
      await t.rollback();
      throw new Error(
        `Invalid status transition from ${record.record_status} to ${newStatus}`
      );
    }

    // 3. Prepare update data
    const currentHistory = Array.isArray(record.status_history)
      ? record.status_history
      : [];
    const newHistory = [
      ...currentHistory,
      {
        status: newStatus,
        changed_at: new Date(),
        changed_by: userId,
        notes,
      },
    ];

    const updateData = {
      record_status: newStatus,
      updated_by: userId,
      status_history: newHistory,
    };

    if (newStatus === RECORD_STATUSES.REJECTED) {
      if (!rejection_reason) {
        await t.rollback();
        throw new Error("Rejection reason is required");
      }
      updateData.rejection_reason = rejection_reason;
      updateData.rejected_by = userId;
    } else if (newStatus === RECORD_STATUSES.APPROVED) {
      updateData.approved_by = userId;
    }

    // 4. Update the record
    await record.update(updateData, { transaction: t });

    // 5. Pre-fetch updater information BEFORE email loop
    const updaterWithAdminUnit = await User.findByPk(userId, {
      attributes: ["first_name", "middle_name", "last_name"],
      include: [
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["name"],
          required: false,
        },
      ],
      transaction: t,
    });

    const adminUnitName = updaterWithAdminUnit?.administrativeUnit?.name
      ? updaterWithAdminUnit.administrativeUnit.name
      : "የከተማ መሬት አስተዳደር";

    const emailSubject = `የመሬት ሁኔታ ማሻሻል ${record.parcel_number}`;

    // 6. Prepare email promises (optimized - no DB queries in loop)
    const emailPromises = record.owners.map(async (owner) => {
      if (owner.email) {
        // Get the updater's admin unit details
        const updaterWithAdminUnit = await User.findByPk(userId, {
          attributes: ["id", "first_name", "middle_name", "last_name", "email", "phone_number"],
          include: [
            {
              model: AdministrativeUnit,
              as: "administrativeUnit",
              attributes: ["name"],
              required: false,
            },
          ],
        });

        const adminUnitName = updaterWithAdminUnit.administrativeUnit
          ? updaterWithAdminUnit.administrativeUnit.name
          : "የከተማ መሬት አስተዳደር";

        const subject = `የመሬት ሁኔታ ማሻሻል ${record.parcel_number}`;

        let emailBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>ውድ ${owner.first_name} ${owner.middle_name},</p>
        <p>(መዝገብ #${record.parcel_number}) መዝገብ ቁጥር ያለው የመሬትዎ ሁኔታ ተሻሻሏል:</p>
        
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
          <p><strong>አሁናዊ ሁኔታ:</strong> ${newStatus}</p>
    `;

        if (notes) {
          emailBody += `
          <p><strong>ተያያዥ ጽሁፍ:</strong></p>
          <p style="background-color: #fff; padding: 8px; border-left: 3px solid #3498db;">
            ${notes}
          </p>
      `;
        }

        if (rejection_reason) {
          emailBody += `
          <p><strong>ውድቅ የተደረገበት ምክንያት:</strong></p>
          <p style="background-color: #fff; padding: 8px; border-left: 3px solid #e74c3c;">
            ${rejection_reason}
          </p>
      `;
        }

        emailBody += `
        </div>
        
        <p><strong>ያሻሻለው አካል:</strong> ${updaterWithAdminUnit.first_name} ${updaterWithAdminUnit.middle_name}</p>
        <p><strong>ከ:</strong> ${adminUnitName}</p>
        
        <div style="margin-top: 20px;">
          <p>እናመሰግናለን</p>
          <p>የ ${adminUnitName} ከተማ መሬት አስተዳደር</p>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <a href="${process.env.FRONTEND_URL}/land-records/${record.id}" 
             style="background-color: #2ecc71; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            መሬት መዝገብ ለማየት ይህን ይጫኑ
          </a>
        </div>
        
        <div style="margin-top: 30px; font-size: 0.9em; color: #7f8c8d;">
          <p>ይህ ኢሜይል በስርአቱ በአውቶማቲክ መንገድ ተልኳል። እባክዎ በቀጥታ ምላሽ አይስጡ።</p>
        </div>
      </div>
    `;

        try {
          await sendEmail({
            to: owner.email,
            subject: emailSubject,
            html: emailBody,
          });
          console.log(`Status update email sent to ${owner.email}`);
        } catch (emailError) {
          console.error(`Failed to send email to ${owner.email}:`, emailError);
        }
      }
    });

    // Commit transaction before sending emails
    await t.commit();

    // Wait for emails (non-blocking, don't fail operation if emails fail)
    Promise.allSettled(emailPromises).catch(() => {
      // Silent catch - emails are non-critical
    });

    // 7. Return updated record (lightweight query)
    return await LandRecord.findByPk(recordId, {
      attributes: ['id', 'parcel_number', 'record_status'],
      include: [
        { 
          model: User, 
          as: "creator",
          attributes: ['id', 'first_name', 'last_name']
        },
        { 
          model: User, 
          as: "updater",
          attributes: ['id', 'first_name', 'last_name']
        },
      ],
    });

  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    console.error(`Status change failed: ${error.message}`);
    throw error;
  }
};

// Helper function for email generation
const generateEmailBody = (owner, record, newStatus, notes, rejection_reason, updater, adminUnitName) => {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <p>ውድ ${owner.first_name} ${owner.middle_name},</p>
      <p>(መዝገብ #${record.parcel_number}) መዝገብ ቁጥር ያለው የመሬትዎ ሁኔታ ተሻሻሏል:</p>
      
      <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
        <p><strong>አሁናዊ ሁኔታ:</strong> ${newStatus}</p>
        ${notes ? `
          <p><strong>ተያያዥ ጽሁፍ:</strong></p>
          <p style="background-color: #fff; padding: 8px; border-left: 3px solid #3498db;">
            ${notes}
          </p>
        ` : ''}
        ${rejection_reason ? `
          <p><strong>ውድቅ የተደረገበት ምክንያት:</strong></p>
          <p style="background-color: #fff; padding: 8px; border-left: 3px solid #e74c3c;">
            ${rejection_reason}
          </p>
        ` : ''}
      </div>
      
      <p><strong>ያሻሻለው አካል:</strong> ${updater.first_name} ${updater.middle_name}</p>
      <p><strong>ከ:</strong> ${adminUnitName}</p>
      
      <div style="margin-top: 20px;">
        <p>እናመሰግናለን</p>
        <p>የ ${adminUnitName} ከተማ መሬት አስተዳደር</p>
      </div>
      
      <div style="margin-top: 30px; text-align: center;">
        <a href="${process.env.FRONTEND_URL}/land-records/${record.id}" 
           style="background-color: #2ecc71; color: white; padding: 10px 20px; 
                  text-decoration: none; border-radius: 5px; display: inline-block;">
          መሬት መዝገብ ለማየት ይህን ይጫኑ
        </a>
      </div>
      
      <div style="margin-top: 30px; font-size: 0.9em; color: #7f8c8d;">
        <p>ይህ ኢሜይል በስርአቱ በአውቶማቲክ መንገድ ተልኳል። እባክዎ በቀጥታ ምላሽ አይስጡ።</p>
      </div>
    </div>
  `;
};

// trash management services
const moveToTrashService = async (
  recordId,
  user,
  deletion_reason,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Validate deletion reason
    if (!deletion_reason || deletion_reason.trim().length < 5) {
      throw new Error("የመሰረዝ ምክንያት በቂ መረጃ ሊሰጥ ይገባል (ቢያንስ 5 ቁምፊዎች)");
    }

    const record = await LandRecord.findOne({
      where: { id: recordId, deletedAt: null },
      transaction: t,
    });

    if (!record) {
      throw new Error("መዝገብ አልተገኘም ወይም አስቀድሞ ተሰርዟል።");
    }

    // Update action log and deletion info
    record.action_log = [
      ...(record.action_log || []),
      {
        action: "MOVED_TO_TRASH",
        changed_by: {
          id: user.id,
          first_name: user.first_name,
          middle_name: user.middle_name,
          last_name: user.last_name,
        },
        changed_at: new Date(),
        notes: deletion_reason,
      },
    ];
    record.deleted_by = user.id;

    await record.save({ transaction: t });

    // Soft delete the record (Sequelize will cascade to Documents & LandPayments)
    await record.destroy({ transaction: t });

    if (!transaction) await t.commit();

    return {
      id: record.id,
      parcel_number: record.parcel_number,
      deletedAt: new Date(),
      deleted_by: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
      },
      message: "መዝገብ ወደ ትራሽ ተዛውሯል",
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
    // 1. Find the record (including soft-deleted) with minimal associations
    const record = await LandRecord.findOne({
      where: { id: recordId },
      paranoid: false,
      transaction: t,
      attributes: ["id", "action_log", "deletedAt"],
    });

    if (!record) {
      throw new Error("መዝገብ አልተገኘም።");
    }

    if (!record.deletedAt) {
      throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም።");
    }

    // 2. Restore main record and associations in parallel
    await Promise.all([
      record.restore({ transaction: t }),

      // Restore all documents in bulk (more efficient than individual restores)
      Document.restore({
        where: { land_record_id: recordId },
        transaction: t,
      }),

      // Restore all payments in bulk
      LandPayment.restore({
        where: { land_record_id: recordId },
        transaction: t,
      }),
    ]);

    // 3. Update action log with full user details
    record.action_log = [
      ...(record.action_log || []),
      {
        action: "RESTORED_FROM_TRASH",
        changed_by: {
          id: user.id,
          first_name: user.first_name,
          middle_name: user.middle_name,
          last_name: user.last_name,
        },
        changed_at: new Date(),
        notes: "Record and all associations restored",
      },
    ];

    await record.save({ transaction: t });

    if (!transaction) await t.commit();

    // 4. Return the full record by calling existing service
    return await getLandRecordByIdService(recordId, { transaction: t });
  } catch (error) {
    if (!transaction && t) await t.rollback();

    // Enhanced error handling
    if (error.name.includes("Sequelize")) {
      throw new Error("የዳታቤዝ ስህተት፡ መልሶ ማስጀመር አልተቻለም።");
    }

    throw new Error(
      error.message.includes("መዝገብ")
        ? error.message
        : `ያልተጠበቀ ስህተት፡ ${error.message}`
    );
  }
};

const permanentlyDeleteService = async (recordId, user, options = {}) => {
  const { transaction, ipAddress, userAgent } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // 1. Verify record exists
    const record = await LandRecord.findOne({
      where: { id: recordId },
      paranoid: false,
      transaction: t,
      attributes: [
        "id",
        "parcel_number",
        "action_log",
        "deletedAt",
        "deletion_reason",
      ],
    });

    if (!record) throw new Error("መዝገብ አልተገኘም።");
    if (!record.deletedAt) throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም።");

    // 2. Prepare action log entry
    const newActionEntry = {
      action: "PERMANENT_DELETION",
      changed_at: new Date(),
      changed_by: {
        user_id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        role: user.role,
      },
    };

    // 3. Update action log
    await record.update(
      {
        action_log: [...(record.action_log || []), newActionEntry],
      },
      {
        transaction: t,
      }
    );

    // 4. Execute deletions
    await Promise.all([
      Document.destroy({
        where: { land_record_id: recordId },
        force: true,
        transaction: t,
      }),
      LandPayment.destroy({
        where: { land_record_id: recordId },
        force: true,
        transaction: t,
      }),
      LandOwner.destroy({
        where: { land_record_id: recordId },
        force: true,
        transaction: t,
      }),
    ]);

    // 5. Final deletion
    await record.destroy({ force: true, transaction: t });

    if (!transaction) await t.commit();
    return true;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(error.message.includes("መዝገብ"))
  }
};
const getTrashItemsService = async (user, options = {}) => {
  const { page = 1, limit = 10, includeAssociations = false } = options;
  const offset = (page - 1) * limit;

  try {
    // Base query configuration
    const queryOptions = {
      where: {
        deletedAt: { [Op.ne]: null }, // Only soft-deleted records
        // Optional: Filter by user's permissions (e.g., only records they deleted)
        // deleted_by: user.isAdmin ? { [Op.ne]: null } : user.id
      },
      paranoid: false,
      attributes: [
        "id",
        "parcel_number",
        "deletedAt",
        "deleted_by",
        "deletion_reason",
      ],
      order: [["deletedAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "deleter",
          attributes: ["id", "first_name", "middle_name", "last_name", "email"],
        },
      ],
    };

    // Conditionally include associated deleted records
    if (includeAssociations) {
      queryOptions.include.push(
        {
          model: Document,
          as: "documents",
          paranoid: false,
          attributes: ["id", "name", "deletedAt"],
          where: { deletedAt: { [Op.ne]: null } },
          required: false,
        },
        {
          model: LandPayment,
          as: "payments",
          paranoid: false,
          attributes: ["id", "amount", "deletedAt"],
          where: { deletedAt: { [Op.ne]: null } },
          required: false,
        }
      );
    }

    const { count, rows } = await LandRecord.findAndCountAll(queryOptions);

    // Transform response
    return {
      total: count,
      items: rows.map((record) => ({
        id: record.id,
        parcel_number: record.parcel_number,
        deletedAt: record.deletedAt,
        deleted_by: {
          id: record.deleter.id,
          name: `${record.deleter.first_name} ${record.deleter.last_name}`,
        },
        deletion_reason: record.deletion_reason,
        ...(includeAssociations && {
          associated_items: {
            documents: record.documents?.length || 0,
            payments: record.payments?.length || 0,
          },
        }),
        status: "IN_TRASH",
      })),
      pagination: {
        page,
        limit,
        total_pages: Math.ceil(count / limit),
        has_more: page * limit < count,
      },
    };
  } catch (error) {
    // Log error for debugging
    console.error(`Failed to fetch trash items: ${error.message}`);
    throw new Error(
      error.message.includes("timeout")
        ? "የመረጃ ምንጭ በጣም ተጭኗል። እባክዎ ቆይታ ካደረጉ እንደገና ይሞክሩ።"
        : "የመጥፎ ቅርጫት ዝርዝር ማግኘት አልተቻለም።"
    );
  } 
};

//stats
const getLandRecordStats = async (adminUnitId, options = {}) => {
  try{const pLimit = (await import('p-limit')).default;
  
 const limit= pLimit(6);
 
  const baseWhere = { deletedAt: null };
  if (adminUnitId) baseWhere.administrative_unit_id = adminUnitId;

  // Helpers
  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const last7 = new Date(Date.now() - 7*24*60*60*1000);
  const last30 = new Date(Date.now() - 30*24*60*60*1000);

  // System totals (no heavy includes)
  const sysTasks = [
    limit(() => LandRecord.count({ where: baseWhere })),
    limit(() => Document.count({ where: { deletedAt: null } })), // no include
    limit(() => User.count()),
    limit(() => LandOwner.count({ distinct: true, col: "user_id" })),
  ];
  const [all_records, all_documents, all_system_users, all_land_owners] = await Promise.all(sysTasks);

  const result = { system: { all_records, all_documents, all_system_users, all_land_owners } };

  if (!adminUnitId) return result;

  // Use raw SQL to avoid count+include; bind adminUnitId once
  const bind = { adminUnitId };

  // by_status, by_zoning, by_ownership, by_land_use (each in ONE query)
  const [by_status, by_zoning, by_ownership, by_land_use] = await Promise.all([
    limit(() => sequelize.query(
      `
      SELECT record_status AS status, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY record_status
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT zoning_type, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY zoning_type
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT ownership_type, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY ownership_type
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT land_use, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_use
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
  ]);

  // Area stats (sum + grouped top 10)
  const [area_total_row, area_by_zoning, area_by_land_use] = await Promise.all([
    limit(() => sequelize.query(
      `
      SELECT COALESCE(SUM(area),0) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT zoning_type, SUM(area) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY zoning_type
      ORDER BY total_area DESC
      LIMIT 10
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT land_use, SUM(area) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_use
      ORDER BY total_area DESC
      LIMIT 10
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
  ]);
  const total_area = Number(area_total_row?.[0]?.total_area || 0);

  // Owners count (avoid include by using EXISTS)
  const [{ owners_count }] = await limit(() => sequelize.query(
    `
    SELECT COUNT(*)::int AS owners_count
    FROM "users" u
    WHERE EXISTS (
      SELECT 1
      FROM "land_records" lr
      JOIN "land_owners" ulr ON ulr.land_record_id = lr.id AND ulr.user_id = u.id
      WHERE lr."deletedAt" IS NULL AND lr.administrative_unit_id = $adminUnitId
    )
    `,
    { type: sequelize.QueryTypes.SELECT, bind }
  ));

  // Temporal (three counts in one query via conditional aggregation)
  // const [temporal_row] = await limit(() => sequelize.query(
  //   `
  //   SELECT
  //     COUNT(*) FILTER (WHERE "createdAt" >= :last30)::int AS last_30_days,
  //     COUNT(*) FILTER (WHERE "createdAt" >= :last7)::int  AS last_7_days,
  //     COUNT(*) FILTER (WHERE "createdAt" >= :startOfToday)::int AS today
  //   FROM "land_records"
  //   WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
  //   `,
  //   { type: sequelize.QueryTypes.SELECT,
  //     bind: { ...bind, last30, last7, startOfToday } }
  // ));

  // Documents tied to unit (raw join instead of count+include)
  const [{ documents_count }] = await limit(() => sequelize.query(
    `
    SELECT COUNT(*)::int AS documents_count
    FROM "documents" d
    JOIN "land_records" lr ON lr.id = d.land_record_id
    WHERE d."deletedAt" IS NULL
      AND lr."deletedAt" IS NULL
      AND lr.administrative_unit_id = $adminUnitId
    `,
    { type: sequelize.QueryTypes.SELECT, bind }
  ));

  // ownership_category, land_level (grouped)
  const [by_ownership_category, by_land_level] = await Promise.all([
    limit(() => sequelize.query(
      `
      SELECT ownership_category, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY ownership_category
      LIMIT 10
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
    limit(() => sequelize.query(
      `
      SELECT land_level, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_level
      ORDER BY land_level ASC
      LIMIT 10
      `,
      { type: sequelize.QueryTypes.SELECT, bind }
    )),
  ]);

  return {
    ...result,
    administrative_unit: {
      by_status,
      by_zoning,
      by_ownership,
      by_land_use,
      area_stats: { total_area, by_zoning: area_by_zoning, by_land_use: area_by_land_use },
      owners_count,
      // temporal: {
      //   last_30_days: temporal_row.last_30_days,
      //   last_7_days: temporal_row.last_7_days, 
      //   today: temporal_row.today,
      // },
      documents: documents_count,
      by_ownership_category,
      by_land_level,
    }
  };
  }
  catch(e){
    console.log(e)
  }
};


module.exports = {
  moveToTrashService,
  restoreFromTrashService,
  permanentlyDeleteService,
  getRejectedLandRecordsService,
  getTrashItemsService,
  createLandRecordService,
  importLandRecordsFromXLSXService,
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
  getLandRecordStats,
};
