const {
  sequelize,
  LandRecord,
  User,
  AdministrativeUnit,
  RECORD_STATUSES,
  NOTIFICATION_STATUSES,
  PRIORITIES,
  DOCUMENT_TYPES,

  Document,
  LandOwner,
  LandPayment,
  PAYMENT_TYPES,
  OWNERSHIP_TYPES,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");
const { sendEmail } = require("../utils/statusEmail");
const XLSX = require("xlsx");
const { fs } = require("fs");
const {
  buildLandRecordFilters,
  buildLandRecordSorting,
  buildIncludeConditions,
} = require("../utils/landRecordFilterBuilder");

const createLandRecordService = async (data, files, user) => {
  const t = await sequelize.transaction();

  try {
    const { owners = [], land_record, documents = [], land_payment } = data;
    const adminunit = user.administrative_unit_id;
    // Check for Duplicate Parcel
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

    //  Process Profile Pictures
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
              name: [user.first_name, user.middle_name, user.last_name]
                .filter(Boolean)
                .join(" "),
            },
            changed_at: new Date(),
          },
        ],
        action_log: [
          {
            action: "የመሬት መዝገብ ተፈጥሯል",
            changed_by: {
              id: user.id,
              first_name: user.first_name,
              middle_name: user.middle_name,
              last_name: user.last_name,
              email: user.email,
            },
            changed_at: new Date(),
          },
        ],
      },
      { transaction: t }
    );

    // Create and Link Owners to land record
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

    // Handle Documents
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

    // Handle Payment
    let landPayment = null;
    if (
      land_payment &&
      (land_payment.total_amount > 0 || land_payment.paid_amount > 0)
    ) {
      // Only validate if payment data exists
      if (!land_payment.payment_type) {
        throw new Error("የክፍያ አይነት መግለጽ አለበት።");
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
          throw new Error(`Failed to clean up file: ${cleanupError.message}`);
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
  const { transaction } = options; 
  const startTime = Date.now();
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
      totalGroups: 0,
      errors: [],
      errorDetails: [],
      processingTime: 0,
      performance: {
        rowsPerSecond: 0,
      },
    };

    // console.log("🔍 Starting XLSX import process...");
    // console.log("📁 File path:", filePath);
    // console.log("👤 User ID:", user.id);

    // 1. Parse and validate XLSX
    // console.log("📊 Parsing XLSX file...");
    const xlsxData = await parseAndValidateXLSX(filePath);
    results.totalRows = xlsxData.length;
    // console.log(`✅ Found ${results.totalRows} rows in XLSX file`);

    // 2. Group rows by parcel_number + plot_number
    // console.log("📋 Grouping data by parcel and plot numbers...");
    const recordsGrouped = groupXLSXRows(xlsxData);
    const totalGroups = Object.keys(recordsGrouped).length;
    results.totalGroups = totalGroups;
    // console.log(`✅ Grouped into ${totalGroups} unique parcels`);

    // 3. Process each group
    // console.log("🚀 Processing parcels...");
    const groupKeys = Object.keys(recordsGrouped);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < groupKeys.length; i++) {
      const groupKey = groupKeys[i];
      const rows = recordsGrouped[groupKey];
      const primaryRow = rows[0];
      const rowNum = i + 1;

      try {


        const { owners, landRecordData, documents, payments } =
          await transformXLSXData(rows, adminUnitId);

        // Use your existing createLandRecordService
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
            transaction: t,
            isImport: true,
          }
        );

        results.createdCount++;
        successCount++;
      } catch (error) {
        // console.error(
        //   `❌ Error processing parcel ${primaryRow.parcel_number}:`,
        //   error.message
        // );
        handleImportError(error, primaryRow, rowNum, results);
        errorCount++;
      }

      // Log progress every 10 records
      if ((i + 1) % 10 === 0 || i + 1 === totalGroups) {
        // console.log(
        //   `📈 Progress: ${
        //     i + 1
        //   }/${totalGroups} (${successCount} success, ${errorCount} errors)`
        // );
      }
    }

    // Calculate processing time and performance
    const endTime = Date.now();
    results.processingTime = (endTime - startTime) / 1000;
    results.performance.rowsPerSecond =
      results.totalRows > 0 ? results.totalRows / results.processingTime : 0;

    // console.log(`🎉 Import completed in ${results.processingTime.toFixed(2)}s`);
    // console.log(
    //   `📊 Results: ${results.createdCount} created, ${results.skippedCount} skipped, ${results.errors.length} errors`
    // );
    // console.log(
    //   `⚡ Performance: ${results.performance.rowsPerSecond.toFixed(
    //     2
    //   )} rows/second`
    // );

    if (!transaction) await t.commit();

    // Return clean results object (no nested structure)
    return results;
  } catch (error) {
    // console.error("💥 Import failed:", error);

    if (!transaction) await t.rollback();
    throw new Error(`XLSX import failed: ${error.message}`);
  }
};

// ------------------ Enhanced Helper Functions ------------------

async function parseAndValidateXLSX(filePath) {
  try {
    // console.log("📖 Reading XLSX file...");

    // Using xlsx library to parse the file
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // console.log("📄 Converting sheet to JSON...");

    // Convert to JSON
    const xlsxData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: null,
    });

    // console.log(`📝 Validating ${xlsxData.length} rows...`);

    // Validate data
    const validatedData = [];
    const validationErrors = [];

    for (let i = 0; i < xlsxData.length; i++) {
      const row = xlsxData[i];
      try {
        if (!row.parcel_number || !row.plot_number) {
          throw new Error(`ሮው ${i + 2} የ ፓርሴል ቁጥር እና የካርታ ቁጥር መያዝ አለበት።`);
        }
        validatedData.push(row);
      } catch (error) {
        validationErrors.push(error.message);
      }
    }

    if (validationErrors.length > 0) {
      // console.warn(`⚠️ ${validationErrors.length} validation errors found`);
    }

    // console.log(`✅ Validation complete: ${validatedData.length} valid rows`);
    return validatedData;
  } catch (error) {
    // console.error("❌ XLSX parsing failed:", error);
    throw new Error(`ፋይሉን ፓርስ ማድረግ አልተቻለም: ${error.message}`);
  }
}

function groupXLSXRows(xlsxData) {
  try {
    // console.log("👥 Grouping rows by parcel_number + plot_number...");

    const groups = {};
    let duplicateCount = 0;

    for (const row of xlsxData) {
      const key = `${row.parcel_number}_${row.plot_number}`;
      if (!groups[key]) {
        groups[key] = [];
      } else {
        duplicateCount++;
      }
      groups[key].push(row);
    }

    // console.log(
    //   `✅ Created ${
    //     Object.keys(groups).length
    //   } groups (${duplicateCount} duplicate entries)`
    // );
    return groups;
  } catch (error) {
    console.error("❌ Grouping failed:", error);
    throw new Error(`ሮው በቡድን መመደብ አልተቻለም: ${error.message}`);
  }
}

async function transformXLSXData(rows, adminUnitId) {
  try {
    const primaryRow = rows[0];
    const ownershipCategory = primaryRow.ownership_category?.trim();

    // console.log(
    //   `🛠️ Transforming data for parcel ${primaryRow.parcel_number}, ownership: ${ownershipCategory}`
    // );

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
      // console.log(`👥 Preparing ${rows.length} joint owners...`);
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
      // console.log("👤 Preparing single owner...");
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

    // console.log(
    //   `✅ Transformation complete: ${owners.length} owners, ${documents.length} documents, ${payments.length} payments`
    // );

    return { owners, landRecordData, documents, payments };
  } catch (error) {
    // console.error("❌ Data transformation failed:", error);
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

  // console.log(`📝 Error recorded: ${errorMsg}`);
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
// Retrieving all land records with simplified robust filtering
const getAllLandRecordService = async (options = {}) => {
  const { page = 1, pageSize = 10, queryParams = {} } = options;

  try {
    // Calculate offset
    const offset = (page - 1) * pageSize;

    // Build base where clause
    const whereClause = {
      deletedAt: null,
    };

    // Apply parcel number filter if provided
    if (queryParams.parcelNumber) {
      whereClause.parcel_number = {
        [Op.iLike]: `%${queryParams.parcelNumber}%`,
      };
    }

    // Apply block number filter if provided
    if (queryParams.blockNumber) {
      whereClause.block_number = { [Op.iLike]: `%${queryParams.blockNumber}%` };
    }

    // Apply record status filter if provided
    if (queryParams.record_status) {
      whereClause.record_status = queryParams.record_status;
    }

    // Apply land use filter if provided
    if (queryParams.land_use) {
      whereClause.land_use = queryParams.land_use;
    }

    // Apply ownership type filter if provided
    if (queryParams.ownership_type) {
      whereClause.ownership_type = queryParams.ownership_type;
    }

    // Apply ownership category filter if provided
    if (queryParams.ownership_category) {
      whereClause.ownership_category = queryParams.ownership_category;
    }

    // Apply zoning type filter if provided
    if (queryParams.zoning_type) {
      whereClause.zoning_type = queryParams.zoning_type;
    }

    // Apply infrastructure status filter if provided
    if (queryParams.infrastructure_status) {
      whereClause.infrastructure_status = queryParams.infrastructure_status;
    }

    // Apply land history filter if provided
    if (queryParams.land_history) {
      whereClause.land_history = queryParams.land_history;
    }

    // Apply priority filter if provided
    if (queryParams.priority) {
      whereClause.priority = queryParams.priority;
    }

    // Apply notification status filter if provided
    if (queryParams.notification_status) {
      whereClause.notification_status = queryParams.notification_status;
    }

    // Apply has_debt filter if provided
    if (queryParams.has_debt !== undefined && queryParams.has_debt !== "") {
      whereClause.has_debt =
        queryParams.has_debt === "true" || queryParams.has_debt === true;
    }

    // Apply land level filter if provided
    if (queryParams.land_level && !isNaN(queryParams.land_level)) {
      whereClause.land_level = parseInt(queryParams.land_level);
    }

    // Apply area range filters if provided
    if (
      (queryParams.area_min !== undefined && queryParams.area_min !== "") ||
      (queryParams.area_max !== undefined && queryParams.area_max !== "")
    ) {
      whereClause.area = {};
      if (queryParams.area_min !== undefined && queryParams.area_min !== "") {
        whereClause.area[Op.gte] = parseFloat(queryParams.area_min);
      }
      if (queryParams.area_max !== undefined && queryParams.area_max !== "") {
        whereClause.area[Op.lte] = parseFloat(queryParams.area_max);
      }
    }

    // Apply global search if provided
    if (queryParams.search) {
      whereClause[Op.or] = [
        { parcel_number: { [Op.iLike]: `%${queryParams.search}%` } },
        { block_number: { [Op.iLike]: `%${queryParams.search}%` } },
        { block_special_name: { [Op.iLike]: `%${queryParams.search}%` } },
        { address: { [Op.iLike]: `%${queryParams.search}%` } },
        { notes: { [Op.iLike]: `%${queryParams.search}%` } },
        { land_bank_code: { [Op.iLike]: `%${queryParams.search}%` } },
        { remark: { [Op.iLike]: `%${queryParams.search}%` } },
        { north_neighbor: { [Op.iLike]: `%${queryParams.search}%` } },
        { east_neighbor: { [Op.iLike]: `%${queryParams.search}%` } },
        { south_neighbor: { [Op.iLike]: `%${queryParams.search}%` } },
        { west_neighbor: { [Op.iLike]: `%${queryParams.search}%` } },
        { landbank_registrer_name: { [Op.iLike]: `%${queryParams.search}%` } },
        { institution_name: { [Op.iLike]: `%${queryParams.search}%` } },
      ];
    }

    // Get total count
    const totalCount = await LandRecord.count({
      where: whereClause,
    });

    // Build include conditions
    const includeConditions = [
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
          "phone_number",
          "email",
          "address",
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
        ],
      },
    ];

    // Apply plot number filter to documents if provided
    if (queryParams.plotNumber) {
      const documentInclude = includeConditions.find(
        (inc) => inc.as === "documents"
      );
      if (documentInclude) {
        documentInclude.where = {
          plot_number: { [Op.iLike]: `%${queryParams.plotNumber}%` },
        };
      }
    }

    // Apply owner filters if provided
    if (
      queryParams.ownerName ||
      queryParams.nationalId ||
      queryParams.phoneNumber
    ) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = { [Op.or]: [] };

        if (queryParams.ownerName) {
          ownerInclude.where[Op.or].push(
            { first_name: { [Op.iLike]: `%${queryParams.ownerName}%` } },
            { middle_name: { [Op.iLike]: `%${queryParams.ownerName}%` } },
            { last_name: { [Op.iLike]: `%${queryParams.ownerName}%` } }
          );
        }
        if (queryParams.nationalId) {
          ownerInclude.where[Op.or].push({
            national_id: { [Op.iLike]: `%${queryParams.nationalId}%` },
          });
        }
        if (queryParams.phoneNumber) {
          ownerInclude.where[Op.or].push({
            phone_number: { [Op.iLike]: `%${queryParams.phoneNumber}%` },
          });
        }
      }
    }

    // Build sorting
    let order = [["createdAt", "DESC"]];
    if (queryParams.sort_by && queryParams.sort_order) {
      const validSortFields = [
        "parcel_number",
        "area",
        "land_level",
        "createdAt",
        "updatedAt",
        "record_status",
        "land_use",
        "block_number",
        "block_special_name",
        "ownership_type",
        "zoning_type",
        "infrastructure_status",
        "land_bank_code",
        "address",
        "institution_name",
        "landbank_registrer_name",
        "priority",
        "notification_status",
      ];

      if (validSortFields.includes(queryParams.sort_by)) {
        const sortDirection =
          queryParams.sort_order.toUpperCase() === "ASC" ? "ASC" : "DESC";
        order = [[queryParams.sort_by, sortDirection]];
      }
    }

    // Fetch paginated land records
    const landRecords = await LandRecord.findAll({
      where: whereClause,
      include: includeConditions,
      attributes: [
        "id",
        "parcel_number",
        "block_number",
        "block_special_name",
        "area",
        "land_level",
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "ownership_category",
        "zoning_type",
        "record_status",
        "infrastructure_status",
        "land_bank_code",
        "land_history",
        "has_debt",
        "north_neighbor",
        "east_neighbor",
        "south_neighbor",
        "west_neighbor",
        "address",
        "plan",
        "notes",
        "remark",
        "rejection_reason",
        "priority",
        "notification_status",
        "status_history",
        "action_log",
        "administrative_unit_id",
        "created_by",
        "approved_by",
        "createdAt",
        "updatedAt",
      ],
      limit: pageSize,
      offset: offset,
      order: order,
      subQuery: false,
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    // Process the results
    const processedRecords = landRecords.map((record) => {
      const recordData = record.toJSON();

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      // Add computed fields for easier frontend consumption
      recordData.owner_names =
        recordData.owners
          ?.map((owner) =>
            `${owner.first_name || ""} ${owner.middle_name || ""} ${
              owner.last_name || ""
            }`.trim()
          )
          .join(", ") || "";

      recordData.document_count = recordData.documents?.length || 0;
      recordData.payment_count = recordData.payments?.length || 0;

      // Add administrative unit name for easy access
      recordData.administrative_unit_name =
        recordData.administrativeUnit?.name || "";

      // Add creator and approver names for easy access
      recordData.creator_name = recordData.creator
        ? `${recordData.creator.first_name || ""} ${
            recordData.creator.middle_name || ""
          } ${recordData.creator.last_name || ""}`.trim()
        : "";

      recordData.approver_name = recordData.approver
        ? `${recordData.approver.first_name || ""} ${
            recordData.approver.middle_name || ""
          } ${recordData.approver.last_name || ""}`.trim()
        : "";

      // Add owner details summary
      recordData.owner_details =
        recordData.owners?.map((owner) => ({
          name: `${owner.first_name || ""} ${owner.middle_name || ""} ${
            owner.last_name || ""
          }`.trim(),
          national_id: owner.national_id,
          phone_number: owner.phone_number,
          email: owner.email,
          address: owner.address,
        })) || [];

      return recordData;
    });

    const result = {
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: totalPages,
      data: processedRecords,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return result;
  } catch (error) {
    throw new Error(`የመሬት መዝገቦችን ማምጣት አልተቻለም: ${error.message}`);
  }
};
// Get filter options for frontend
const getFilterOptionsService = async () => {
  try {
    const options = await LandRecord.findAll({
      attributes: [
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "record_status",
        "priority",
        "notification_status",
        "zoning_type",
        "infrastructure_status",
        "land_history",
        "ownership_category",
      ],
      group: [
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "record_status",
        "priority",
        "notification_status",
        "zoning_type",
        "infrastructure_status",
        "land_history",
        "ownership_category",
      ],
      raw: true,
    });

    // Get unique administrative units
    const adminUnits = await AdministrativeUnit.findAll({
      attributes: ["id", "name"],
      raw: true,
    });

    const filterOptions = {
      land_use: [
        ...new Set(options.map((opt) => opt.land_use).filter(Boolean)),
      ],
      ownership_type: [
        ...new Set(options.map((opt) => opt.ownership_type).filter(Boolean)),
      ],
      lease_ownership_type: [
        ...new Set(
          options.map((opt) => opt.lease_ownership_type).filter(Boolean)
        ),
      ],
      record_status: [
        ...new Set(options.map((opt) => opt.record_status).filter(Boolean)),
      ],
      priority: [
        ...new Set(options.map((opt) => opt.priority).filter(Boolean)),
      ],
      notification_status: [
        ...new Set(
          options.map((opt) => opt.notification_status).filter(Boolean)
        ),
      ],
      zoning_type: [
        ...new Set(options.map((opt) => opt.zoning_type).filter(Boolean)),
      ],
      infrastructure_status: [
        ...new Set(
          options.map((opt) => opt.infrastructure_status).filter(Boolean)
        ),
      ],
      land_history: [
        ...new Set(options.map((opt) => opt.land_history).filter(Boolean)),
      ],
      ownership_category: [
        ...new Set(
          options.map((opt) => opt.ownership_category).filter(Boolean)
        ),
      ],
      administrative_units: adminUnits.map((unit) => ({
        id: unit.id,
        name: unit.name,
      })),
    };

    return {
      success: true,
      data: filterOptions,
    };
  } catch (error) {
    throw new Error(`Failed to get filter options: ${error.message}`);
  }
};

// Get statistics for dashboard
const getLandRecordsStatsService = async () => {
  try {
    const stats = await LandRecord.findAll({
      attributes: [
        "record_status",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["record_status"],
      raw: true,
    });

    const total = await LandRecord.count();
    const withDebt = await LandRecord.count({ where: { has_debt: true } });
    const draftCount = await LandRecord.count({ where: { is_draft: true } });

    return {
      success: true,
      data: {
        by_status: stats,
        total,
        with_debt: withDebt,
        draft_count: draftCount,
        approved_count:
          stats.find((stat) => stat.record_status === "ጸድቋል")?.count || 0,
      },
    };
  } catch (error) {
    throw new Error(`Failed to get statistics: ${error.message}`);
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
        {
          model: User,
          as: "updater",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
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

    throw new Error(`Failed to retrieve land records: ${error.message}`);
  }
};
// Retrieving land records by creator with simplified robust filtering
const getLandRecordsByCreatorService = async (userId, options = {}) => {
  if (!userId) throw new Error("User ID is required");

  const { page = 1, pageSize = 10, queryParams = {} } = options;

  try {
    // Calculate offset
    const offset = (page - 1) * pageSize;

    // Build base where clause
    const whereClause = {
      created_by: userId,
      deletedAt: null,
    };

    // Apply parcel number filter if provided
    if (queryParams.parcelNumber) {
      whereClause.parcel_number = {
        [Op.iLike]: `%${queryParams.parcelNumber}%`,
      };
    }

    // Apply block number filter if provided
    if (queryParams.blockNumber) {
      whereClause.block_number = { [Op.iLike]: `%${queryParams.blockNumber}%` };
    }

    // Apply record status filter if provided
    if (queryParams.record_status) {
      whereClause.record_status = queryParams.record_status;
    }

    // Apply land use filter if provided
    if (queryParams.land_use) {
      whereClause.land_use = queryParams.land_use;
    }

    // Apply ownership type filter if provided
    if (queryParams.ownership_type) {
      whereClause.ownership_type = queryParams.ownership_type;
    }

    // Apply global search if provided
    if (queryParams.search) {
      whereClause[Op.or] = [
        { parcel_number: { [Op.iLike]: `%${queryParams.search}%` } },
        { block_number: { [Op.iLike]: `%${queryParams.search}%` } },
        { address: { [Op.iLike]: `%${queryParams.search}%` } },
      ];
    }

    // Get total count
    const totalCount = await LandRecord.count({
      where: whereClause,
    });

    // Build include conditions
    const includeConditions = [
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
          "phone_number",
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
        attributes: ["id", "plot_number", "document_type"],
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
        ],
      },
    ];

    // Apply plot number filter to documents if provided
    if (queryParams.plotNumber) {
      const documentInclude = includeConditions.find(
        (inc) => inc.as === "documents"
      );
      if (documentInclude) {
        documentInclude.where = {
          plot_number: { [Op.iLike]: `%${queryParams.plotNumber}%` },
        };
      }
    }

    // Apply owner filters if provided
    if (
      queryParams.ownerName ||
      queryParams.nationalId ||
      queryParams.phoneNumber
    ) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = { [Op.or]: [] };

        if (queryParams.ownerName) {
          ownerInclude.where[Op.or].push(
            { first_name: { [Op.iLike]: `%${queryParams.ownerName}%` } },
            { middle_name: { [Op.iLike]: `%${queryParams.ownerName}%` } },
            { last_name: { [Op.iLike]: `%${queryParams.ownerName}%` } }
          );
        }
        if (queryParams.nationalId) {
          ownerInclude.where[Op.or].push({
            national_id: { [Op.iLike]: `%${queryParams.nationalId}%` },
          });
        }
        if (queryParams.phoneNumber) {
          ownerInclude.where[Op.or].push({
            phone_number: { [Op.iLike]: `%${queryParams.phoneNumber}%` },
          });
        }
      }
    }

    // Fetch paginated land records
    const landRecords = await LandRecord.findAll({
      where: whereClause,
      include: includeConditions,
      attributes: [
        "id",
        "parcel_number",
        "block_number",
        "block_special_name",
        "area",
        "land_level",
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "ownership_category",
        "zoning_type",
        "record_status",
        "infrastructure_status",
        "land_bank_code",
        "land_history",
        "has_debt",
        "north_neighbor",
        "east_neighbor",
        "south_neighbor",
        "west_neighbor",
        "address",
        "plan",
        "notes",
        "remark",
        "rejection_reason",
        "priority",
        "notification_status",
        "status_history",
        "action_log",
        "administrative_unit_id",
        "created_by",
        "approved_by",
        "createdAt",
        "updatedAt",
      ],
      limit: pageSize,
      offset: offset,
      order: [["createdAt", "DESC"]],
      subQuery: false,
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    // Process the results
    const processedRecords = landRecords.map((record) => {
      const recordData = record.toJSON();

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      // Add computed fields for easier frontend consumption
      recordData.owner_names =
        recordData.owners
          ?.map((owner) =>
            `${owner.first_name || ""} ${owner.middle_name || ""} ${
              owner.last_name || ""
            }`.trim()
          )
          .join(", ") || "";

      recordData.document_count = recordData.documents?.length || 0;
      recordData.payment_count = recordData.payments?.length || 0;

      // Add administrative unit name for easy access
      recordData.administrative_unit_name =
        recordData.administrativeUnit?.name || "";

      return recordData;
    });

    const result = {
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: totalPages,
      data: processedRecords,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return result;
  } catch (error) {
    throw new Error(`የመሬት መዝገቦችን በመጠቀም ላይ ስህተት ተፈጥሯል: ${error.message}`);
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

    throw new Error(`Failed to get user land records: ${error.message}`);
  }
};
const getLandRecordsByUserAdminUnitService = async (
  adminUnitId,
  options = {}
) => {
  const { transaction, page = 1, pageSize = 10 } = options;

  const t = transaction || (await sequelize.transaction());
  const offset = (page - 1) * pageSize;

  try {
    // Build where conditions
    const whereConditions = {
      administrative_unit_id: adminUnitId,
      deletedAt: { [Op.eq]: null },
    };

    // Get total count first
    const totalCount = await LandRecord.count({
      where: whereConditions,
      transaction: t,
    });

    // Fetch paginated records
    const records = await LandRecord.findAll({
      where: whereConditions,
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
      offset,
      limit: pageSize,
      transaction,
      distinct: true, // Important for correct counting with includes
    });

    // Process records
    const processedRecords = records.map((record) => ({
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

    if (!transaction) await t.commit();

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      total: totalCount,
      page,
      pageSize,
      totalPages: totalPages,
      data: processedRecords,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
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
          through: {
            attributes: ["ownership_percentage", "verified"],
            paranoid: false,
          },
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
          changed_by: {
            id: updater.id,
            first_name: updater.first_name,
            middle_name: updater.middle_name,
            last_name: updater.last_name,
          },
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
          attributes: ["id", "first_name", "middle_name", "last_name", "email"],
        },
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
    // Fetch user info for status changer
    const statusChanger = await User.findByPk(userId, {
      attributes: ["id", "first_name", "middle_name", "last_name", "email"],
      transaction: t,
    });

    const newHistory = [
      ...currentHistory,
      {
        status: newStatus,
        changed_at: new Date(),
        changed_by: {
          id: statusChanger.id,
          name: [
            statusChanger.first_name,
            statusChanger.middle_name,
            statusChanger.last_name,
          ]
            .filter(Boolean)
            .join(" "),
        },
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
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "email",
            "phone_number",
          ],
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
        } catch (emailError) {}
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
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        {
          model: User,
          as: "updater",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
      ],
    });
  } catch (error) {
    if (t && !t.finished) {
      await t.rollback();
    }
    throw error;
  }
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
      throw new Error("የመሰረዝ ምክንያት ቢያንስ 5 ቁምፊ መሆን አለበት።");
    }

    // Fetch the record with associated data
    const record = await LandRecord.findOne({
      where: { id: recordId, deletedAt: null },
      include: [
        { model: Document, as: "documents" },
        { model: LandPayment, as: "payments" },
        {
          model: User,
          as: "owners",
          through: { attributes: [], paranoid: false },
          attributes: ["id", "first_name", "last_name", "email"],
        },
      ],
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
    record.deletion_reason = deletion_reason;
    await record.save({ transaction: t });

    // Soft delete LandRecord
    await record.destroy({ transaction: t });

    // Soft delete related Documents
    if (record.documents?.length) {
      for (const doc of record.documents) {
        await doc.destroy({ transaction: t });
      }
    }

    // Soft delete related Payments
    if (record.payments?.length) {
      for (const payment of record.payments) {
        await payment.destroy({ transaction: t });
      }
    }

    // Soft delete ownership links (LandOwner join table)
    await LandOwner.destroy({
      where: { land_record_id: record.id },
      transaction: t,
    });

    if (!transaction) await t.commit();

    // Re-fetch the trashed record including owners, documents, and payments
    const trashedRecord = await LandRecord.findOne({
      where: { id: record.id },
      paranoid: false,
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [], paranoid: false }, // include trashed join rows
          attributes: ["id", "first_name", "last_name", "email"],
        },
        { model: Document, as: "documents", paranoid: false },
        { model: LandPayment, as: "payments", paranoid: false },
      ],
    });

    return {
      id: trashedRecord.id,
      parcel_number: trashedRecord.parcel_number,
      deletedAt: trashedRecord.deletedAt,
      deleted_by: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
      },
      owners: trashedRecord.owners,
      documents: trashedRecord.documents,
      payments: trashedRecord.payments,
      message: "መዝገብና ተያያዥ መረጃዎች በትራሽ ተዘርዝረዋል።",
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
    });

    if (!record) throw new Error("መዝገብ አልተገኘም።");
    if (!record.deletedAt) throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም።");

    // 2. Prepare action log entry
    const newActionEntry = {
      action: "PERMANENT_DELETION",
      changed_at: new Date(),
      changed_by: {
        user_id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
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
    throw new Error(error.message.includes("መዝገብ"));
  }
};
const getTrashItemsService = async (user, options = {}) => {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  try {
    const queryOptions = {
      where: {
        deletedAt: { [Op.ne]: null },
      },
      paranoid: false,
      order: [["deletedAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "deleter",
          attributes: ["id", "first_name", "middle_name", "last_name", "email"],
        },
        {
          model: User,
          as: "owners",
          through: { paranoid: false, attributes: [] },
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
          model: Document,
          as: "documents",
          paranoid: false,
          where: { deletedAt: { [Op.ne]: null } },
          attributes: [
            "id",
            "document_type",
            "files",
            "plot_number",
            "createdAt",
          ],
          required: false,
        },
        {
          model: LandPayment,
          as: "payments",
          paranoid: false,
          where: { deletedAt: { [Op.ne]: null } },
          required: false,
        },
      ],
    };

    const { count, rows } = await LandRecord.findAndCountAll(queryOptions);

    return {
      total: count,
      items: rows,
      pagination: {
        page,
        limit,
        total_pages: Math.ceil(count / limit),
        has_more: page * limit < count,
      },
    };
  } catch (error) {
    throw new Error(
      error.message.includes("timeout")
        ? "የመረጃ ምንጭ በጣም ተጭኗል። እባክዎ ቆይታ ካደረጉ እንደገና ይሞክሩ።"
        : "የመጥፎ ቅርጫት ዝርዝር ማግኘት አልተቻለም።"
    );
  }
};

//stats
const getLandRecordStats = async (adminUnitId, options = {}) => {
  try {
    const pLimit = (await import("p-limit")).default;

    const limit = pLimit(6);

    const baseWhere = { deletedAt: null };
    if (adminUnitId) baseWhere.administrative_unit_id = adminUnitId;

    // Helpers
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // System totals (no heavy includes)
    const sysTasks = [
      limit(() => LandRecord.count({ where: baseWhere })),
      limit(() => Document.count({ where: { deletedAt: null } })), // no include
      limit(() => User.count()),
      limit(() => LandOwner.count({ distinct: true, col: "user_id" })),
    ];
    const [all_records, all_documents, all_system_users, all_land_owners] =
      await Promise.all(sysTasks);

    const result = {
      system: { all_records, all_documents, all_system_users, all_land_owners },
    };

    if (!adminUnitId) return result;

    // Use raw SQL to avoid count+include; bind adminUnitId once
    const bind = { adminUnitId };

    // by_status, by_zoning, by_ownership, by_land_use (each in ONE query)
    const [by_status, by_zoning, by_ownership, by_land_use] = await Promise.all(
      [
        limit(() =>
          sequelize.query(
            `
      SELECT record_status AS status, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY record_status
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
        limit(() =>
          sequelize.query(
            `
      SELECT zoning_type, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY zoning_type
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
        limit(() =>
          sequelize.query(
            `
      SELECT ownership_type, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY ownership_type
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
        limit(() =>
          sequelize.query(
            `
      SELECT land_use, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_use
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
      ]
    );

    // Area stats (sum + grouped top 10)
    const [area_total_row, area_by_zoning, area_by_land_use] =
      await Promise.all([
        limit(() =>
          sequelize.query(
            `
      SELECT COALESCE(SUM(area),0) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
        limit(() =>
          sequelize.query(
            `
      SELECT zoning_type, SUM(area) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY zoning_type
      ORDER BY total_area DESC
      LIMIT 10
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
        limit(() =>
          sequelize.query(
            `
      SELECT land_use, SUM(area) AS total_area
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_use
      ORDER BY total_area DESC
      LIMIT 10
      `,
            { type: sequelize.QueryTypes.SELECT, bind }
          )
        ),
      ]);
    const total_area = Number(area_total_row?.[0]?.total_area || 0);

    // Owners count (avoid include by using EXISTS)
    const [{ owners_count }] = await limit(() =>
      sequelize.query(
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
      )
    );

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
    const [{ documents_count }] = await limit(() =>
      sequelize.query(
        `
    SELECT COUNT(*)::int AS documents_count
    FROM "documents" d
    JOIN "land_records" lr ON lr.id = d.land_record_id
    WHERE d."deletedAt" IS NULL
      AND lr."deletedAt" IS NULL
      AND lr.administrative_unit_id = $adminUnitId
    `,
        { type: sequelize.QueryTypes.SELECT, bind }
      )
    );

    // ownership_category, land_level (grouped)
    const [by_ownership_category, by_land_level] = await Promise.all([
      limit(() =>
        sequelize.query(
          `
      SELECT ownership_category, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY ownership_category
      LIMIT 10
      `,
          { type: sequelize.QueryTypes.SELECT, bind }
        )
      ),
      limit(() =>
        sequelize.query(
          `
      SELECT land_level, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL AND administrative_unit_id = $adminUnitId
      GROUP BY land_level
      ORDER BY land_level ASC
      LIMIT 10
      `,
          { type: sequelize.QueryTypes.SELECT, bind }
        )
      ),
    ]);

    return {
      ...result,
      administrative_unit: {
        by_status,
        by_zoning,
        by_ownership,
        by_land_use,
        area_stats: {
          total_area,
          by_zoning: area_by_zoning,
          by_land_use: area_by_land_use,
        },
        owners_count,
        // temporal: {
        //   last_30_days: temporal_row.last_30_days,
        //   last_7_days: temporal_row.last_7_days,
        //   today: temporal_row.today,
        // },
        documents: documents_count,
        by_ownership_category,
        by_land_level,
      },
    };
  } catch (e) {
    throw new Error(`የመሬት ሪኮርድ ስታቲስቲክስ ማግኘት አልተቻለም። ${e.message}`);
  }
};

const getLandBankRecordsService = async (user, page = 1, pageSize = 10) => {
  try {
    // Calculate offset
    const offset = (page - 1) * pageSize;

    // Get total count
    const totalCount = await LandRecord.count({
      where: {
        ownership_type: OWNERSHIP_TYPES.MERET_BANK,
        administrative_unit_id: user.administrative_unit_id,
        deletedAt: null,
      },
    });

    // Fetch paginated land records
    const landRecords = await LandRecord.findAll({
      where: {
        ownership_type: OWNERSHIP_TYPES.MERET_BANK,
        administrative_unit_id: user.administrative_unit_id,
        deletedAt: null,
      },
      include: [
        {
          model: Document,
          as: "documents",
        },
      ],
      limit: pageSize,
      offset: offset,
      order: [["createdAt", "DESC"]], // Optional: Add ordering
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / pageSize);

    // Transform the result to JSON format
    const data = landRecords.map((record) => ({
      landRecord: record.toJSON(),
      documents: record.documents || [],
    }));

    return {
      count: totalCount,
      totalPages: totalPages,
      currentPage: page,
      pageSize: pageSize,
      data: data,
    };
  } catch (error) {
    throw new Error(`የመሬት ባንክ መዝገቦችን ማግኘት ስህተት: ${error.message}`);
  }
};

module.exports = {
  moveToTrashService,
  restoreFromTrashService,
  permanentlyDeleteService,
  getLandBankRecordsService,
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
  getLandRecordsStatsService,
  getFilterOptionsService,
};
