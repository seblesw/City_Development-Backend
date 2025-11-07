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
  Sequelize,
  ActionLog,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");
const { sendEmail } = require("../utils/statusEmail");
const XLSX = require("xlsx");
const fs = require("fs");
const createLandRecordService = async (data, files, user, options = {}) => {
  const { transaction: externalTransaction, isImport = false } = options;
  const t = externalTransaction || (await sequelize.transaction());

  try {
    const { owners = [], land_record, documents = [], land_payment } = data;
    const adminunit = user.administrative_unit_id;

    // 🚀 OPTIMIZED: For imports, check plot_number in documents table
    // For normal operations, keep the original parcel_number check
    if (isImport) {
      const plotNumber = documents[0]?.plot_number;
      if (!plotNumber) {
        throw new Error("የመሬት ቁጥር (plot_number) ከሰነዶች አልተገኘም።");
      }

      const existingDocument = await Document.findOne({
        where: {
          plot_number: plotNumber,
          deletedAt: null,
        },
        attributes: ["id"],
        transaction: t,
      });

      if (existingDocument) {
        throw new Error(`ይህ የመሬት ቁጥር (${plotNumber}) በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።`);
      }
    } else {
      // Original duplicate check for normal operations
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
    }

    const processOwnerPhotos = () => {
      if (!files) return owners;

      const profilePictures = Array.isArray(files?.profile_picture)
        ? files.profile_picture.filter(
            (file) => file && file.serverRelativePath
          )
        : files?.profile_picture && files.profile_picture.serverRelativePath
        ? [files.profile_picture]
        : [];

      return owners.map((owner, index) => ({
        ...owner,
        profile_picture: profilePictures[index]?.serverRelativePath || null,
      }));
    };

    const ownersWithPhotos = isImport ? owners : processOwnerPhotos();

    // 🚀 OPTIMIZED: Skip status_history during import for performance
    const landRecordData = {
      ...land_record,
      administrative_unit_id: adminunit,
      created_by: user.id,
      record_status: RECORD_STATUSES.SUBMITTED,
      notification_status: NOTIFICATION_STATUSES.NOT_SENT,
      priority: land_record.priority || PRIORITIES.MEDIUM,
    };

    // Only add status_history for non-import operations
    if (!isImport) {
      landRecordData.status_history = [
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
      ];
    }

    const landRecord = await LandRecord.create(landRecordData, { transaction: t });

    // 🚀 OPTIMIZED: Skip ActionLog during import for performance
    if (!isImport) {
      await ActionLog.create({
        land_record_id: landRecord.id,
        admin_unit_id:adminunit,
        performed_by: user.id,
        action_type: 'RECORD_CREATED',
        notes: 'የመሬት መዝገብ ተፈጥሯል',
        additional_data: {
          parcel_number: landRecord.parcel_number,
          administrative_unit_id: adminunit,
          owners_count: owners.length,
          documents_count: documents.length,
          created_by_name: [user.first_name, user.middle_name, user.last_name].filter(Boolean).join(" "),
          initial_status: RECORD_STATUSES.SUBMITTED,
          action_description: "የመሬት መዝገብ ተፈጥሯል"
        }
      }, { transaction: t });
    }

    // 🚀 OPTIMIZED: Use bulk operations for imports
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

    // 🚀 OPTIMIZED: Use bulkCreate for land owners during import
    if (isImport && createdOwners.length > 0) {
      const landOwnerData = createdOwners.map((owner) => ({
        user_id: owner.id,
        land_record_id: landRecord.id,
        ownership_percentage: land_record.ownership_category === "የጋራ" ? 100 / createdOwners.length : 100,
        verified: true,
        created_at: new Date(),
      }));
      
      await LandOwner.bulkCreate(landOwnerData, { transaction: t });
    } else {
      await Promise.all(
        createdOwners.map((owner) =>
          LandOwner.create(
            {
              user_id: owner.id,
              land_record_id: landRecord.id,
              ownership_percentage: land_record.ownership_category === "የጋራ" ? 100 / createdOwners.length : 100,
              verified: true,
              created_at: new Date(),
            },
            { transaction: t }
          )
        )
      );
    }

    // 🚀 OPTIMIZED: Skip document processing during import or use bulk operations
    let documentResults = [];
    if (!isImport && documents.length > 0) {
      const filesArr = Array.isArray(files?.documents)
        ? files.documents.filter((file) => file && file.serverRelativePath)
        : [];

      documentResults = await Promise.all(
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
    } else if (isImport && documents.length > 0) {
      // 🚀 OPTIMIZED: Bulk create documents for imports
      const documentData = documents.map((doc) => ({
        ...doc,
        land_record_id: landRecord.id,
        created_by: user.id,
        created_at: new Date(),
      }));
      
      const createdDocs = await Document.bulkCreate(documentData, { transaction: t });
      documentResults = createdDocs.map(doc => doc.toJSON());
    }

    let landPayment = null;
    if (land_payment && (land_payment.total_amount > 0 || land_payment.paid_amount > 0)) {
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

    if (!externalTransaction) {
      await t.commit();
    }

    return {
      landRecord: landRecord.toJSON(),
      owners: createdOwners.map((o) => o.toJSON()),
      documents: documentResults,
      landPayment: landPayment?.toJSON(),
    };
  } catch (error) {
    if (!externalTransaction) {
      await t.rollback();
    }

    if (!isImport && files) {
      const cleanupFiles = Object.values(files).flat();
      cleanupFiles.forEach((file) => {
        try {
          if (file && file.path) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          // Silent fail
        }
      });
    }

    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};

//importLandRecordsFromXLSXService
const importLandRecordsFromXLSXService = async (filePath, user) => {
  const startTime = Date.now();

  try {
    if (!user?.administrative_unit_id) {
      throw new Error("የተጠቃሚው አስተዳደራዊ ክፍል አልተገኘም።");
    }

    const adminUnitId = user.administrative_unit_id;

    // Stream and parse XLSX file
    const { validatedData, validationErrors } = await streamAndParseXLSX(
      filePath
    );

    if (validatedData.length === 0 && validationErrors.length === 0) {
      throw new Error("ፋይሉ ባዶ ነው ወይም ምንም የሚገባ ውሂብ አልተገኘም።");
    }

    if (validatedData.length === 0) {
      throw new Error("ሁሉም የተጻፉ ውሂቦች ስህተት አላቸው። ከላይ ያሉትን ስህተቶች ይመልከቱ።");
    }

    // 🚀 OPTIMIZED: Remove preloadExistingPlots - let createLandRecordService handle duplicates
    const results = {
      createdCount: 0,
      skippedCount: 0,
      totalRows: validatedData.length,
      errors: validationErrors,
      errorDetails: [],
      processingTime: 0,
    };

    // 🚀 OPTIMIZED: Just group by plot number without duplicate checking
    const uniquePlots = new Map();
    for (const row of validatedData) {
      const plotKey = String(row.plot_number).trim();
      
      // Skip invalid plot numbers only
      if (!plotKey || plotKey === "null" || plotKey === "undefined") {
        continue;
      }

      if (!uniquePlots.has(plotKey)) {
        uniquePlots.set(plotKey, [row]);
      } else {
        uniquePlots.get(plotKey).push(row);
      }
    }

    if (uniquePlots.size === 0) {
      throw new Error("ሁሉም ውሂቦች ባዶ ናቸው።");
    }

    // 🚀 OPTIMIZED: Increase concurrency since we removed the bottleneck
    const BATCH_SIZE = 100; // Smaller batches for better parallelization
    const CONCURRENCY = 5; // More concurrent operations

    const plotEntries = Array.from(uniquePlots.entries());

    console.log(
      `🔄 Processing ${plotEntries.length} unique plots from ${validatedData.length} total rows`
    );

    const batchResults = await processBatchesWithConcurrency(
      plotEntries,
      adminUnitId,
      user,
      BATCH_SIZE,
      CONCURRENCY
    );

    // Aggregate results
    Object.assign(results, batchResults);

    const endTime = Date.now();
    results.processingTime = (endTime - startTime) / 1000;
    results.performance = {
      rowsPerSecond:
        results.totalRows > 0 ? results.totalRows / results.processingTime : 0,
      plotsProcessed: results.createdCount,
      successRate:
        ((results.createdCount / plotEntries.length) * 100).toFixed(2) + "%",
      totalTime: `${Math.round(results.processingTime)}s`,
    };

    // Cleanup file
    try {
      await fs.promises.unlink(filePath);
    } catch (cleanupError) {
      console.warn("⚠️ Could not delete temporary file:", cleanupError.message);
    }

    console.log(
      `✅ Import completed: ${results.createdCount} created, ${results.skippedCount} skipped in ${results.processingTime}s`
    );

    return results;
  } catch (error) {
    // Cleanup file on error
    try {
      await fs.promises.unlink(filePath);
    } catch (cleanupError) {
      console.warn(
        "⚠️ Could not delete temporary file on error:",
        cleanupError.message
      );
    }

    const amharicErrors = ["የተጠቃሚው", "ምንም የሚገባ", "ሁሉም ውሂቦች", "ፋይሉ", "የተጻፉ"];
    const isAmharicError = amharicErrors.some((phrase) =>
      error.message.includes(phrase)
    );

    if (isAmharicError) {
      console.error("❌ Import failed with Amharic error:", error.message);
      throw error;
    }

    console.error("❌ Import failed:", error.message);
    throw new Error(`የ Excel ፋይል ማስገቢያ አልተሳካም: ${error.message}`);
  }
};
async function streamAndParseXLSX(filePath) {
  return new Promise((resolve, reject) => {
    const validatedData = [];
    const validationErrors = [];
    let rowCount = 0;

    try {
      console.log(`📖 Reading Excel file: ${filePath}`);

      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        dense: true,
        sheetStubs: true,
      });

      // Check if worksheet exists
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error("ፋይሉ ባዶ ነው ወይም ምንም ሉህ አልተገኘም።");
      }

      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      // Check if worksheet has data
      if (!worksheet || !worksheet["!ref"]) {
        throw new Error("የመጀመሪያው ሉህ ባዶ ነው።");
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: null,
        blankrows: false,
      });

      console.log(`📊 Found ${jsonData.length} rows in Excel file`);

      if (jsonData.length === 0) {
        throw new Error("በ Excel ፋይሉ ውስጥ ምንም ውሂብ አልተገኘም።");
      }

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        rowCount = i + 2; // +2 because Excel rows start at 1 and header is row 1

        try {
          // Store original row number for error reporting
          row.__rowNum__ = i;

          // Critical validation with Amharic errors
          if (!row.plot_number) {
            throw new Error(`ረድፍ ${rowCount} የካርታ ቁጥር ያስፈልጋል።`);
          }

          if (!row.land_use) {
            throw new Error(`ረድፍ ${rowCount} የመሬት አጠቃቀም ዓይነት ያስፈልጋል።`);
          }

          if (!row.ownership_type) {
            throw new Error(`ረድፍ ${rowCount} የባለቤትነት ዓይነት ያስፈልጋል።`);
          }

          // Data normalization with validation
          row.plot_number = String(row.plot_number).trim();
          row.land_use = String(row.land_use).trim();
          row.ownership_type = String(row.ownership_type).trim();
          row.parcel_number = row.parcel_number
            ? String(row.parcel_number).trim()
            : null;
          row.ownership_category = row.ownership_category
            ? String(row.ownership_category).trim()
            : "የግል";

          // Validate plot number format
          if (
            row.plot_number === "null" ||
            row.plot_number === "undefined" ||
            row.plot_number === "ሰ_ን_ማ" ||
            row.plot_number.length < 2
          ) {
            throw new Error(`ረድፍ ${rowCount} የካርታ ቁጥር ትክክለኛ አይደለም።`);
          }

          // Numeric fields with validation
          row.land_level = parseInt(row.land_level) || 1;
          if (row.land_level < 1 || row.land_level > 10) {
            throw new Error(`ረድፍ ${rowCount} የመሬት ደረጃ በ1 እና 10 መካከል መሆን አለበት።`);
          }

          row.area = parseFloat(row.area) || 0;
          if (row.area < 0) {
            throw new Error(`ረድፍ ${rowCount} ስፋት አሉታዊ መሆን አይችልም።`);
          }

          // Fix common ownership category spelling
          if (
            row.ownership_category === "የገራ" ||
            row.ownership_category === "የጋር"
          ) {
            row.ownership_category = "የጋራ";
          }

          validatedData.push(row);
        } catch (error) {
          // Add row context to error
          const enhancedError = `${error.message} (ረድፍ ${rowCount})`;
          validationErrors.push(enhancedError);
          console.warn(`⚠️ Row ${rowCount} validation error:`, error.message);
        }
      }

      console.log(
        `✅ Parsing completed: ${validatedData.length} valid rows, ${validationErrors.length} errors`
      );

      resolve({ validatedData, validationErrors });
    } catch (error) {
      console.error("❌ Excel parsing failed:", error.message);

      // Provide more specific error messages for common issues
      if (
        error.message.includes("no such file") ||
        error.message.includes("ENOENT")
      ) {
        reject(new Error("ፋይሉ አልተገኘም። የቀረበው ፋይል መንገድ ትክክል መሆኑን ያረጋግጡ።"));
      } else if (error.message.includes("file format")) {
        reject(
          new Error(
            "የቀረበው ፋይል ቅርጽ ትክክል አይደለም። እባክዎ ትክክለኛ Excel ፋይል (.xlsx ወይም .xls) ያስገቡ።"
          )
        );
      } else if (error.message.includes("password")) {
        reject(new Error("ፋይሉ በይለፍ ቃል ተጠቅሷል። ያልተገደበ ፋይል ያስገቡ።"));
      } else {
        reject(new Error(`ፋይሉን ማንበብ አልተቻለም: ${error.message}`));
      }
    }
  });
}
// function filterUniquePlots(xlsxData, existingPlots) {
//   const uniquePlots = new Map();
//   let stats = { skippedExisting: 0, skippedInvalid: 0 };

//   for (const row of xlsxData) {
//     const plotKey = String(row.plot_number).trim();

//     // Skip invalid plot numbers
//     if (!plotKey || plotKey === "null" || plotKey === "undefined") {
//       stats.skippedInvalid++;
//       continue;
//     }

//     // Skip existing plots
//     if (existingPlots.has(plotKey)) {
//       stats.skippedExisting++;
//       continue;
//     }

//     // Group by plot number
//     if (!uniquePlots.has(plotKey)) {
//       uniquePlots.set(plotKey, [row]);
//     } else {
//       uniquePlots.get(plotKey).push(row);
//     }
//   }

//   // Log summary for debugging
//   if (stats.skippedExisting > 0 || stats.skippedInvalid > 0) {
//     console.log(
//       `📊 Filter stats: ${uniquePlots.size} unique, ${stats.skippedExisting} existing, ${stats.skippedInvalid} invalid`
//     );
//   }

//   return uniquePlots;
// }
async function processBatchesWithConcurrency(
  plotEntries,
  adminUnitId,
  user,
  batchSize = 200,
  concurrency = 3
) {
  const results = {
    createdCount: 0,
    skippedCount: 0,
    errors: [],
    errorDetails: [],
  };

  const totalBatches = Math.ceil(plotEntries.length / batchSize);
  console.log(
    `🔄 Processing ${plotEntries.length} plots in ${totalBatches} batches`
  );

  // Process with controlled concurrency using a simple semaphore
  const processWithConcurrency = async () => {
    const semaphore = new Semaphore(concurrency);
    const promises = [];

    for (let i = 0; i < plotEntries.length; i += batchSize) {
      const batch = plotEntries.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      promises.push(
        semaphore.acquire().then(async () => {
          try {
            console.log(
              `📦 Starting batch ${batchNumber}/${totalBatches} (${batch.length} plots)`
            );
            const batchResult = await processBatch(
              batch,
              adminUnitId,
              user,
              batchNumber
            );

            results.createdCount += batchResult.createdCount;
            results.skippedCount += batchResult.skippedCount;
            results.errors.push(...batchResult.errors);
            results.errorDetails.push(...batchResult.errorDetails);

            console.log(
              `  ✅ Batch ${batchNumber} completed: ${batchResult.createdCount} created, ${batchResult.skippedCount} skipped`
            );

            return batchResult;
          } catch (error) {
            console.error(`  ❌ Batch ${batchNumber} failed:`, error.message);
            results.skippedCount += batch.length;
            results.errors.push(
              `Batch ${batchNumber} failed: ${error.message}`
            );
            return null;
          } finally {
            semaphore.release();
          }
        })
      );
    }

    await Promise.allSettled(promises);
  };

  await processWithConcurrency();

  console.log(
    `✅ All batches completed: ${results.createdCount} created, ${results.skippedCount} skipped`
  );
  return results;
}
// Simple semaphore implementation
class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.max) {
      this.current++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    } else {
      this.current--;
    }
  }
}
async function processBatch(
  batchEntries,
  adminUnitId,
  user,
  batchNumber = null
) {
  const batchResults = {
    createdCount: 0,
    skippedCount: 0,
    errors: [],
    errorDetails: [],
  };

  const batchInfo = batchNumber ? `Batch ${batchNumber}` : "Current batch";
  console.log(`🔧 ${batchInfo}: Processing ${batchEntries.length} plots`);

  const processPromises = batchEntries.map(async ([plotNumber, rows]) => {
    try {
      // Transform data with enhanced error context
      const transformedData = await transformXLSXData(rows, adminUnitId);

      // Call your existing service WITHOUT transaction - let createLandRecordService handle it
      await createLandRecordService(
        {
          land_record: transformedData.landRecordData,
          owners: transformedData.owners,
          documents: transformedData.documents,
          land_payment: transformedData.payments[0] || null,
        },
        [], // No files during import
        user,
        {
          isImport: true,
          // REMOVED: transaction: t - let createLandRecordService handle its own transactions
        }
      );

      console.log(`✅ Successfully created plot: ${plotNumber}`);
      return { success: true, plotNumber };
    } catch (error) {
      // Extract detailed error information
      const detailedError = extractDetailedError(error, plotNumber);

      console.warn(`⚠️ Failed to create plot ${plotNumber}:`, detailedError);

      return {
        success: false,
        error: new Error(detailedError),
        plotNumber,
        primaryRow: rows[0],
      };
    }
  });

  const results = await Promise.allSettled(processPromises);

  // Process results with better error extraction
  results.forEach((result, index) => {
    const [plotNumber, rows] = batchEntries[index];

    if (result.status === "fulfilled" && result.value.success) {
      batchResults.createdCount++;
    } else {
      batchResults.skippedCount++;

      let error;
      let row;

      if (result.status === "rejected") {
        error = result.reason;
        row = { plot_number: plotNumber };
      } else {
        error = result.value.error;
        row = result.value.primaryRow;
      }

      // Create a clean error message without the generic wrapper
      const cleanErrorMessage = getCleanErrorMessage(error.message, plotNumber);
      const errorMsg = `ካርታ ${plotNumber}: ${cleanErrorMessage}`;

      batchResults.errors.push(errorMsg);
      batchResults.errorDetails.push({
        plot_number: plotNumber,
        error: cleanErrorMessage,
        row_data: row,
        batch_number: batchNumber,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Log batch summary
  if (batchResults.createdCount > 0 || batchResults.skippedCount > 0) {
    console.log(
      `📊 ${batchInfo} results: ${batchResults.createdCount} created, ${batchResults.skippedCount} skipped`
    );
  }

  return batchResults;
}

// Helper function to extract clean error messages
function getCleanErrorMessage(errorMessage, plotNumber) {
  // Remove redundant prefixes
  let cleanMessage = errorMessage
    .replace(`ካርታ ${plotNumber}: `, "")
    .replace(`ረድፍ ${plotNumber}: `, "")
    .replace("የመዝገብ መፍጠር ስህተት: ", "")
    .replace("የሰነድ መፍጠር ስህተት: ", "")
    .trim();

  // If it's still a generic validation error, try to extract more details
  if (
    cleanMessage === "Validation error" &&
    errorMessage.includes("Validation error")
  ) {
    return "የውሂብ ማረጋገጫ ስህተት። አንዳንድ መስኮች ትክክለኛ አይደሉም።";
  }

  return cleanMessage;
}
// Enhanced error extraction function
function extractDetailedError(error, plotNumber) {
  let errorMessage = error.message;

  // Case 1: Sequelize validation errors
  if (error.name === "SequelizeValidationError" && error.errors) {
    const validationErrors = error.errors.map((err) => {
      const field = err.path || "unknown_field";
      const message = err.message || "Validation failed";
      return `${field}: ${message}`;
    });

    if (validationErrors.length > 0) {
      return `የውሂብ ማረጋገጫ ስህተቶች: ${validationErrors.join("; ")}`;
    }
  }

  // Case 2: Database constraint errors
  if (error.original) {
    const dbError = error.original;

    // Unique constraint violation
    if (dbError.code === "23505") {
      if (dbError.detail && dbError.detail.includes("plot_number")) {
        return "ይህ የመሬት ቁጥር በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።";
      }
      return "ድርብ መረጃ ተገኝቷል። አንዳንድ መረጃዎች ቀደም ሲል ተመዝግተዋል።";
    }

    // Foreign key violation
    if (dbError.code === "23503") {
      return "የተሳሳተ ማጣቀሻ መረጃ። አንዳንድ የተዛመዱ መረጃዎች አልተገኙም።";
    }

    // Return original database message if it's meaningful
    if (dbError.message && !dbError.message.includes("Validation error")) {
      return dbError.message;
    }
  }

  // Case 3: Custom error messages from our transform function
  if (
    errorMessage.includes("ረድፍ") ||
    errorMessage.includes("ያስፈልጋል") ||
    errorMessage.includes("ትክክለኛ") ||
    errorMessage.includes("መሆን አለበት")
  ) {
    return errorMessage;
  }

  // Case 4: Network or connection errors
  if (
    errorMessage.includes("timeout") ||
    errorMessage.includes("ECONNREFUSED") ||
    errorMessage.includes("Network")
  ) {
    return "የውሂብ ጎታ ግንኙነት ስህተት። እባክዎ እንደገና ይሞክሩ።";
  }

  // Default: return the original message but clean it up
  return errorMessage.replace("Validation error", "የውሂብ ማረጋገጫ ስህተት");
}

async function transformXLSXData(rows, adminUnitId) {
  try {
    const primaryRow = rows[0];

    // Validation with Amharic errors
    if (!primaryRow.plot_number) {
      throw new Error("የካርታ ቁጥር ያስፈልጋል።");
    }

    if (!primaryRow.land_use) {
      throw new Error("የመሬት አጠቃቀም ዓይነት ያስፈልጋል።");
    }

    if (!primaryRow.ownership_type) {
      throw new Error("የባለቤትነት ዓይነት ያስፈልጋል።");
    }

    const ownershipCategory = primaryRow.ownership_category || "የግል";
    let owners = [];

    if (ownershipCategory === "የጋራ") {
      // Shared ownership - multiple owners
      owners = rows.map((row, index) => {
        // if (!row.first_name || !row.middle_name) {
        //   throw new Error(`ተጋሪ ${index + 1} ስም እና የአባት ስም ያስፈልጋል።`);
        // }

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
    } else {
      // Single ownership - use primary row
      if (!primaryRow.first_name || !primaryRow.middle_name) {
        throw new Error("ዋና ባለቤት ስም እና የአባት ስም ያስፈልጋል።");
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
    }

    // Land record data - parcel_number can be null

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

    // Documents - use all rows for shared ownership, primary row for single
    const documentRows = ownershipCategory === "የጋራ" ? rows : [primaryRow];
    const documents = documentRows.map((row) => ({
      document_type: DOCUMENT_TYPES.TITLE_DEED,
      plot_number: row.plot_number,
      approver_name: row.approver_name || null,
      preparer_name: row.preparer_name || null,
      reference_number: row.reference_number || null,
      description: row.description || null,
      issue_date: row.issue_date ? new Date(row.issue_date) : null,
      files: [],
    }));

    // Payments
    const paymentRows = ownershipCategory === "የጋራ" ? rows : [primaryRow];
    const payments = paymentRows
      .filter((row) => row.payment_type)
      .map((row) => ({
        payment_type: row.payment_type || PAYMENT_TYPES.TAX,
        total_amount: parseFloat(row.total_amount) || 0,
        paid_amount: parseFloat(row.paid_amount) || 0,
        currency: row.currency || "ETB",
        payment_status: calculatePaymentStatus(row),
        description: row.payment_description || "ከ Excel ፋይል ክፍያ",
      }));

    return { owners, landRecordData, documents, payments };
  } catch (error) {
    throw new Error(`ውሂብ ማቀናበር አልተቻለም: ${error.message}`);
  }
}
function calculatePaymentStatus(row) {
  // Fast path: if no payment data, return default status
  if (!row.total_amount && !row.paid_amount) {
    return "አልተከፈለም";
  }

  try {
    // Use unary plus for faster number conversion than parseFloat
    const total = +row.total_amount || 0;
    const paid = +row.paid_amount || 0;

    // Early returns for common cases
    if (paid <= 0) return "አልተከፈለም";
    if (paid >= total) return "ተጠናቋል";
    return "በመጠባበቅ ላይ";
  } catch (error) {
    return "አልተከፈለም";
  }
}
// Service to save land record as draft
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

      primaryOwner = landRecord.user;

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
    } else {
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

    const {
      primary_user,
      co_owners = [],
      land_record = {},
      documents = [],
      land_payment,
    } = data;

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

        return documentService.createDocumentService(docData, [file], user.id, {
          transaction: t,
        });
      })
    );

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
        record_status: RECORD_STATUSES.SUBMITTED,
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
const getAllLandRecordService = async (options = {}) => {
  const { page = 1, pageSize = 10, queryParams = {} } = options;

  try {
    const offset = (page - 1) * pageSize;

    const whereClause = {
      deletedAt: null,
    };

    if (queryParams.parcelNumber) {
      whereClause.parcel_number = {
        [Op.iLike]: `%${queryParams.parcelNumber}%`,
      };
    }

    if (queryParams.blockNumber) {
      whereClause.block_number = { [Op.iLike]: `%${queryParams.blockNumber}%` };
    }

    if (queryParams.record_status) {
      whereClause.record_status = queryParams.record_status;
    }

    if (queryParams.land_use) {
      whereClause.land_use = queryParams.land_use;
    }

    if (queryParams.ownership_type) {
      whereClause.ownership_type = queryParams.ownership_type;
    }

    if (queryParams.ownership_category) {
      whereClause.ownership_category = queryParams.ownership_category;
    }

    if (queryParams.zoning_type) {
      whereClause.zoning_type = queryParams.zoning_type;
    }

    if (queryParams.infrastructure_status) {
      whereClause.infrastructure_status = queryParams.infrastructure_status;
    }

    if (queryParams.land_history) {
      whereClause.land_history = queryParams.land_history;
    }

    if (queryParams.priority) {
      whereClause.priority = queryParams.priority;
    }

    if (queryParams.notification_status) {
      whereClause.notification_status = queryParams.notification_status;
    }

    if (queryParams.has_debt !== undefined && queryParams.has_debt !== "") {
      whereClause.has_debt =
        queryParams.has_debt === "true" || queryParams.has_debt === true;
    }

    if (queryParams.land_level && !isNaN(queryParams.land_level)) {
      whereClause.land_level = parseInt(queryParams.land_level);
    }

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

    const totalCount = await LandRecord.count({
      where: whereClause,
    });

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

    const totalPages = Math.ceil(totalCount / pageSize);

    const processedRecords = landRecords.map((record) => {
      const recordData = record.toJSON();

      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

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

      recordData.administrative_unit_name =
        recordData.administrativeUnit?.name || "";

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
const getFilterOptionsService = async (adminUnitId = null) => {
  try {
    // Base where clause for administrative unit filtering
    const whereClause = adminUnitId
      ? { administrative_unit_id: adminUnitId }
      : {};

    // Get distinct values from LandRecord for ONLY the specified filters
    const landRecordOptions = await LandRecord.findAll({
      attributes: [
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "lease_transfer_reason",
        "land_level",
        "record_status",
        "priority",
        "ownership_category",
      ],
      where: whereClause,
      group: [
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "lease_transfer_reason",
        "land_level",
        "record_status",
        "priority",
        "ownership_category",
      ],
      raw: true,
    });

    // FIXED: Get plot_number options from Document model without GROUP BY issues
    const documentOptions = await Document.findAll({
      attributes: ["plot_number"],
      where: {
        plot_number: {
          [Op.ne]: null,
          [Op.ne]: "", // Also exclude empty strings
        },
      },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: [], // Only include for filtering, not for selection
          where: adminUnitId ? { administrative_unit_id: adminUnitId } : {},
          required: true,
        },
      ],
      raw: true,
    });

    // Alternative approach for plot numbers using separate query (more reliable)
    const plotNumbers = await Document.aggregate("plot_number", "DISTINCT", {
      plain: false,
      where: {
        plot_number: {
          [Op.ne]: null,
          [Op.ne]: "",
        },
      },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: [],
          where: adminUnitId ? { administrative_unit_id: adminUnitId } : {},
          required: true,
        },
      ],
    });

    // Get area range for slider
    const areaRange = await LandRecord.findOne({
      attributes: [
        [sequelize.fn("MIN", sequelize.col("area")), "min_area"],
        [sequelize.fn("MAX", sequelize.col("area")), "max_area"],
        [sequelize.fn("AVG", sequelize.col("area")), "avg_area"],
      ],
      where: whereClause,
      raw: true,
    });

    // Get date range for createdAt filter
    const dateRange = await LandRecord.findOne({
      attributes: [
        [sequelize.fn("MIN", sequelize.col("createdAt")), "min_date"],
        [sequelize.fn("MAX", sequelize.col("createdAt")), "max_date"],
      ],
      where: whereClause,
      raw: true,
    });

    // Get total records count for metadata
    const totalRecords = await LandRecord.count({ where: whereClause });

    // Helper function to get sorted unique values
    const getSortedUniqueValues = (key, sortType = "alphabetical") => {
      const values = [
        ...new Set(landRecordOptions.map((opt) => opt[key]).filter(Boolean)),
      ];

      if (sortType === "numerical") {
        return values.sort((a, b) => a - b);
      } else if (sortType === "priority") {
        const priorityOrder = ["high", "medium", "low"];
        return values.sort(
          (a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b)
        );
      } else {
        return values.sort();
      }
    };

    // Process plot numbers from the aggregation result
    const processedPlotNumbers = plotNumbers
      ? plotNumbers
          .map((item) => item.DISTINCT)
          .filter(Boolean)
          .sort()
      : [
          ...new Set(
            documentOptions.map((opt) => opt.plot_number).filter(Boolean)
          ),
        ].sort();

    const filterOptions = {
      // ==================== QUICK FILTERS ====================
      land_use: getSortedUniqueValues("land_use"),
      ownership_type: getSortedUniqueValues("ownership_type"),
      lease_ownership_type: getSortedUniqueValues("lease_ownership_type"),
      lease_transfer_reason: getSortedUniqueValues("lease_transfer_reason"),
      land_level: getSortedUniqueValues("land_level", "numerical"),
      record_status: getSortedUniqueValues("record_status"),
      priority: getSortedUniqueValues("priority", "priority"),
      ownership_category: getSortedUniqueValues("ownership_category"),

      // ==================== PLOT NUMBER FILTER ====================
      plot_number: processedPlotNumbers,

      // ==================== BOOLEAN FILTERS ====================
      boolean_filters: {
        has_debt: [
          { value: "true", label: "Has Debt" },
          { value: "false", label: "No Debt" },
        ],
        include_deleted: [
          { value: "true", label: "Include Deleted" },
          { value: "false", label: "Exclude Deleted" },
        ],
      },

      // ==================== RANGE DATA FOR UI ====================
      ranges: {
        area: {
          min: parseFloat(areaRange?.min_area) || 0,
          max: parseFloat(areaRange?.max_area) || 100000,
          avg: parseFloat(areaRange?.avg_area) || 0,
          step: 0.1,
          unit: "m²",
          format: (value) => `${value.toLocaleString()} m²`,
        },
        date: {
          min: dateRange?.min_date || new Date("2000-01-01"),
          max: dateRange?.max_date || new Date(),
          format: (date) => new Date(date).toLocaleDateString("en-ET"),
        },
        land_level: {
          min:
            Math.min(...getSortedUniqueValues("land_level", "numerical")) || 1,
          max:
            Math.max(...getSortedUniqueValues("land_level", "numerical")) || 10,
          step: 1,
          format: (level) => `Level ${level}`,
        },
      },

      // ==================== SORT OPTIONS ====================
      sort_options: [
        { value: "createdAt_DESC", label: "Newest First", group: "date" },
        { value: "createdAt_ASC", label: "Oldest First", group: "date" },
        { value: "updatedAt_DESC", label: "Recently Updated", group: "date" },
        {
          value: "parcel_number_ASC",
          label: "Parcel Number (A-Z)",
          group: "identification",
        },
        {
          value: "parcel_number_DESC",
          label: "Parcel Number (Z-A)",
          group: "identification",
        },
        { value: "area_DESC", label: "Largest Area First", group: "land" },
        { value: "area_ASC", label: "Smallest Area First", group: "land" },
        {
          value: "land_level_DESC",
          label: "Highest Land Level First",
          group: "land",
        },
        {
          value: "land_level_ASC",
          label: "Lowest Land Level First",
          group: "land",
        },
        {
          value: "priority_DESC",
          label: "Highest Priority First",
          group: "status",
        },
        {
          value: "priority_ASC",
          label: "Lowest Priority First",
          group: "status",
        },
      ],

      // ==================== SEARCH TYPES ====================
      search_types: [
        {
          value: "global",
          label: "Global Search",
          description: "Search across all fields",
        },
        {
          value: "owner_name",
          label: "Owner Name",
          description: "Search by owner name",
        },
        {
          value: "parcel_number",
          label: "Parcel Number",
          description: "Search by parcel number",
        },
        {
          value: "plot_number",
          label: "Plot Number",
          description: "Search by plot number",
        },
        {
          value: "national_id",
          label: "National ID",
          description: "Search by national ID",
        },
        {
          value: "phone_number",
          label: "Phone Number",
          description: "Search by phone number",
        },
      ],

      // ==================== FILTER GROUPS FOR ORGANIZED UI ====================
      filter_groups: {
        quick_filters: {
          label: "Quick Filters",
          filters: [
            "land_use",
            "ownership_type",
            "lease_ownership_type",
            "lease_transfer_reason",
            "land_level",
          ],
        },
        status_filters: {
          label: "Status Filters",
          filters: ["record_status", "priority", "ownership_category"],
        },
        identification: {
          label: "Identification",
          filters: ["parcel_number", "plot_number"],
        },
        owner_search: {
          label: "Owner Search",
          filters: ["owner_name", "national_id", "phone_number"],
        },
        range_filters: {
          label: "Range Filters",
          filters: ["area", "date_range", "land_level_range"],
        },
        additional_filters: {
          label: "Additional Filters",
          filters: ["has_debt", "include_deleted"],
        },
      },

      // ==================== UI CONFIGURATION ====================
      ui_config: {
        default_page_size: 10,
        page_size_options: [10, 20, 50, 100],
        max_search_results: 1000,
        debounce_timeout: 300,
        auto_complete_min_chars: 2,
      },
    };

    return {
      success: true,
      data: filterOptions,
      metadata: {
        generated_at: new Date().toISOString(),
        total_filters: Object.keys(filterOptions).length - 5, // Exclude metadata fields
        total_records: totalRecords,
        administrative_unit: adminUnitId || "all",
        quick_filters_count:
          filterOptions.filter_groups.quick_filters.filters.length,
        status_filters_count:
          filterOptions.filter_groups.status_filters.filters.length,
        range_filters_count:
          filterOptions.filter_groups.range_filters.filters.length,
        additional_filters_count:
          filterOptions.filter_groups.additional_filters.filters.length,
        plot_numbers_count: processedPlotNumbers.length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to get filter options: ${error.message}`);
  }
};

const getLandRecordsStatsByAdminUnit = async (adminUnitId) => {
  try {
    // Fixed date calculations without mutation
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);
    monthStart.setHours(0, 0, 0, 0);

    const yearStart = new Date(now);
    yearStart.setFullYear(now.getFullYear() - 1);
    yearStart.setHours(0, 0, 0, 0);

    // Execute all essential queries in parallel
    const [
      totalStats,
      timeBasedStats,
      landUseStats,
      ownershipStats,
      zoningStats,
      landLevelStats,
      monthlyTrends,
      weeklyTrends,
      yearlyTrends,
      leaseStats,
      recentActivity,
    ] = await Promise.all([
      // 1. Total Statistics
      LandRecord.findOne({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "total_records"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
          [Sequelize.fn("MAX", Sequelize.col("area")), "max_area"],
          [Sequelize.fn("MIN", Sequelize.col("area")), "min_area"],
        ],
        raw: true,
      }),

      // 2. Time-based Statistics
      LandRecord.findOne({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.between]: [yearStart, todayEnd] },
        },
        attributes: [
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(
                `CASE WHEN "createdAt" >= '${todayStart.toISOString()}' THEN 1 END`
              )
            ),
            "today_count",
          ],
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(
                `CASE WHEN "createdAt" >= '${weekStart.toISOString()}' THEN 1 END`
              )
            ),
            "weekly_count",
          ],
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(
                `CASE WHEN "createdAt" >= '${monthStart.toISOString()}' THEN 1 END`
              )
            ),
            "monthly_count",
          ],
          [
            Sequelize.fn(
              "COUNT",
              Sequelize.literal(
                `CASE WHEN "createdAt" >= '${yearStart.toISOString()}' THEN 1 END`
              )
            ),
            "yearly_count",
          ],
        ],
        raw: true,
      }),

      // 3. Land Use Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "land_use",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["land_use"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 4. Ownership Type Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "ownership_type",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["ownership_type"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 5. Zoning Type Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "zoning_type",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["zoning_type"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 6. Land Level Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "land_level",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["land_level"],
        order: ["land_level"],
        raw: true,
      }),

      // 7. Monthly Trends (Last 12 months)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: yearStart },
        },
        attributes: [
          [
            Sequelize.fn("DATE_TRUNC", "month", Sequelize.col("createdAt")),
            "month",
          ],
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: [
          Sequelize.fn("DATE_TRUNC", "month", Sequelize.col("createdAt")),
        ],
        order: [
          [
            Sequelize.fn("DATE_TRUNC", "month", Sequelize.col("createdAt")),
            "ASC",
          ],
        ],
        raw: true,
      }),

      // 8. Weekly Trends (Last 12 weeks)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: weekStart },
        },
        attributes: [
          [
            Sequelize.fn("DATE_TRUNC", "week", Sequelize.col("createdAt")),
            "week",
          ],
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: [Sequelize.fn("DATE_TRUNC", "week", Sequelize.col("createdAt"))],
        order: [
          [
            Sequelize.fn("DATE_TRUNC", "week", Sequelize.col("createdAt")),
            "ASC",
          ],
        ],
        raw: true,
      }),

      // 9. Yearly Trends (Last 3 years)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: new Date(now.getFullYear() - 2, 0, 1) },
        },
        attributes: [
          [
            Sequelize.fn("DATE_TRUNC", "year", Sequelize.col("createdAt")),
            "year",
          ],
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: [Sequelize.fn("DATE_TRUNC", "year", Sequelize.col("createdAt"))],
        order: [
          [
            Sequelize.fn("DATE_TRUNC", "year", Sequelize.col("createdAt")),
            "ASC",
          ],
        ],
        raw: true,
      }),

      // 10. Lease Analytics
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          lease_ownership_type: { [Op.not]: null },
        },
        attributes: [
          "lease_ownership_type",
          "lease_transfer_reason",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["lease_ownership_type", "lease_transfer_reason"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 11. Recent Activity (last 10 records)
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        include: [
          {
            model: User,
            as: "owners",
            attributes: ["id", "first_name", "last_name"],
            through: { attributes: [] },
          },
        ],
        attributes: [
          "id",
          "parcel_number",
          "land_use",
          "area",
          "record_status",
          "zoning_type",
          "land_level",
          "createdAt",
        ],
        order: [["createdAt", "DESC"]],
        limit: 10,
      }),
    ]);

    const totalRecords = parseInt(totalStats?.total_records) || 0;

    // Process and format the data
    const processedStats = {
      overview: {
        total_records: totalRecords,
        total_area: parseFloat(totalStats?.total_area) || 0,
        average_area: parseFloat(totalStats?.average_area) || 0,
        max_area: parseFloat(totalStats?.max_area) || 0,
        min_area: parseFloat(totalStats?.min_area) || 0,
        area_unit: "square_meters",
      },

      time_analytics: {
        today: parseInt(timeBasedStats?.today_count) || 0,
        last_7_days: parseInt(timeBasedStats?.weekly_count) || 0,
        last_30_days: parseInt(timeBasedStats?.monthly_count) || 0,
        last_365_days: parseInt(timeBasedStats?.yearly_count) || 0,
      },

      distributions: {
        by_land_use: (landUseStats || []).map((item) => ({
          land_use: item.land_use || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_ownership_type: (ownershipStats || []).map((item) => ({
          ownership_type: item.ownership_type || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_zoning_type: (zoningStats || []).map((item) => ({
          zoning_type: item.zoning_type || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_land_level: (landLevelStats || []).map((item) => ({
          land_level: item.land_level || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),
      },

      trends: {
        monthly: (monthlyTrends || []).map((item) => ({
          month: item.month,
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
        })),

        weekly: (weeklyTrends || []).map((item) => ({
          week: item.week,
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
        })),

        yearly: (yearlyTrends || []).map((item) => ({
          year: item.year,
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
        })),
      },

      lease_analytics: {
        summary: {
          total_lease_records: leaseStats?.length || 0,
          lease_percentage:
            totalRecords > 0
              ? (((leaseStats?.length || 0) / totalRecords) * 100).toFixed(1)
              : 0,
        },
        by_lease_type: (leaseStats || []).map((item) => ({
          lease_ownership_type: item.lease_ownership_type || "Unknown",
          lease_transfer_reason: item.lease_transfer_reason || "Not Specified",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
        })),

        // Aggregated by lease type only
        aggregated_by_type: (leaseStats || []).reduce((acc, item) => {
          const type = item.lease_ownership_type || "Unknown";
          if (!acc[type]) {
            acc[type] = {
              count: 0,
              total_area: 0,
              transfer_reasons: {},
            };
          }
          acc[type].count += parseInt(item.count);
          acc[type].total_area += parseFloat(item.total_area) || 0;

          const reason = item.lease_transfer_reason || "Not Specified";
          if (!acc[type].transfer_reasons[reason]) {
            acc[type].transfer_reasons[reason] = 0;
          }
          acc[type].transfer_reasons[reason] += parseInt(item.count);

          return acc;
        }, {}),
      },

      recent_activity: (recentActivity || []).map((record) => ({
        id: record.id,
        parcel_number: record.parcel_number,
        land_use: record.land_use,
        area: record.area,
        record_status: record.record_status,
        zoning_type: record.zoning_type,
        land_level: record.land_level,
        created_at: record.createdAt,
        owner_names:
          record.owners
            ?.map((owner) => `${owner.first_name} ${owner.last_name}`.trim())
            .filter((name) => name) || [],
      })),

      // Essential calculated metrics only
      calculated_metrics: {
        records_per_hectare:
          totalRecords > 0 && totalStats?.total_area > 0
            ? (
                totalRecords /
                (parseFloat(totalStats.total_area) / 10000)
              ).toFixed(2)
            : 0,

        average_land_level:
          landLevelStats?.length > 0
            ? landLevelStats.reduce(
                (sum, item) =>
                  sum + parseInt(item.land_level) * parseInt(item.count),
                0
              ) /
              landLevelStats.reduce(
                (sum, item) => sum + parseInt(item.count),
                0
              )
            : 0,
      },
    };

    return processedStats;
  } catch (error) {
    console.error("Error generating land records stats:", error);
    throw new Error(`Failed to generate statistics: ${error.message}`);
  }
};
const getLandRecordByIdService = async (id, options = {}) => {
  const { transaction, includeDeleted = false } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const landRecord = await LandRecord.findOne({
      where: { id },
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
            "phone_number",
            "profile_picture",
            "address",
          ],
          paranoid: !includeDeleted,
        },

        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "type", "unit_level", "max_land_levels"],
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

    const result = landRecord.toJSON();

    result.total_payments =
      result.payments?.reduce(
        (sum, payment) => sum + parseFloat(payment.paid_amount),
        0
      ) || 0;

    if (!transaction) await t.commit();

    return result;
  } catch (error) {
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
    const landRecords = await LandRecord.findAll({
      where: {
        [Op.or]: [{ created_by: userId }, { "$owners.id$": userId }],
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
            "email",
            "phone_number",
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
            "issue_date",
            "isActive",
            "createdAt",
          ],
          where: { isActive: true },
          required: false,
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

    const processedRecords = landRecords.map((record) => {
      const recordJson = record.toJSON();

      if (recordJson.documents) {
        recordJson.documents = recordJson.documents.map((doc) => ({
          ...doc,
        }));
      }

      if (recordJson.payments) {
        recordJson.payments = recordJson.payments.map((payment) => ({
          ...payment,
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
const getLandRecordsByCreatorService = async (userId, options = {}) => {
  if (!userId) throw new Error("User ID is required");

  const {
    page = 1,
    pageSize = 10,
    includeDeleted = false,
    queryParams = {},
  } = options;

  try {
    const offset = (page - 1) * pageSize;

    const whereClause = {
      created_by: userId,
    };

    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    // ==================== HAS_DEBT FILTER ====================
    if (queryParams.has_debt !== undefined && queryParams.has_debt !== "") {
      whereClause.has_debt = queryParams.has_debt === "true";
    }

    // ==================== QUICK FILTERS ====================

    // Land characteristics
    if (queryParams.land_use) {
      whereClause.land_use = queryParams.land_use;
    }

    if (queryParams.land_level) {
      whereClause.land_level = queryParams.land_level;
    }

    // Ownership details
    if (queryParams.ownership_type) {
      whereClause.ownership_type = queryParams.ownership_type;
    }

    // Lease information
    if (queryParams.lease_ownership_type) {
      whereClause.lease_ownership_type = queryParams.lease_ownership_type;
    }

    if (queryParams.lease_transfer_reason) {
      whereClause.lease_transfer_reason = queryParams.lease_transfer_reason;
    }

    // ==================== RANGE FILTERS ====================

    // Area range filter
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

    // Date range filter
    if (queryParams.startDate || queryParams.endDate) {
      whereClause.createdAt = {};
      if (queryParams.startDate) {
        whereClause.createdAt[Op.gte] = new Date(queryParams.startDate);
      }
      if (queryParams.endDate) {
        whereClause.createdAt[Op.lte] = new Date(queryParams.endDate);
      }
    }

    // ==================== INCLUDE CONDITIONS ====================

    const includeConditions = [
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
    ];

    // ==================== ENHANCED GLOBAL SEARCH ====================

    if (queryParams.search) {
      // Clean and prepare search term
      let searchTerm = queryParams.search.trim();

      // Handle URL encoded characters
      try {
        searchTerm = decodeURIComponent(searchTerm);
      } catch (e) {
        // Continue with original term if decoding fails
      }

      searchTerm = searchTerm.replace(/%25/g, "%");

      // Split search term by spaces to handle full names
      const searchTerms = searchTerm
        .split(/\s+/)
        .filter((term) => term.length > 0);

      // SIMPLIFIED AND IMPROVED SEARCH LOGIC
      const searchConditions = {
        [Op.or]: [
          // LandRecord fields
          { parcel_number: { [Op.iLike]: `%${searchTerm}%` } },

          // Document fields
          { "$documents.plot_number$": { [Op.iLike]: `%${searchTerm}%` } },

          // Owner national_id and phone (always include these)
          { "$owners.national_id$": { [Op.iLike]: `%${searchTerm}%` } },
          { "$owners.phone_number$": { [Op.iLike]: `%${searchTerm}%` } },
        ],
      };

      // ===== SIMPLIFIED NAME SEARCH =====
      if (searchTerms.length > 0) {
        // For single term, search across all name fields
        if (searchTerms.length === 1) {
          const term = searchTerms[0];
          searchConditions[Op.or].push(
            { "$owners.first_name$": { [Op.iLike]: `%${term}%` } },
            { "$owners.middle_name$": { [Op.iLike]: `%${term}%` } },
            { "$owners.last_name$": { [Op.iLike]: `%${term}%` } }
          );
        }
        // For multiple terms (full name), use more specific matching
        else {
          // Search for each term in any name field (OR logic)
          searchTerms.forEach((term) => {
            searchConditions[Op.or].push(
              { "$owners.first_name$": { [Op.iLike]: `%${term}%` } },
              { "$owners.middle_name$": { [Op.iLike]: `%${term}%` } },
              { "$owners.last_name$": { [Op.iLike]: `%${term}%` } }
            );
          });

          // Also search for the full combined name
          searchConditions[Op.or].push(
            Sequelize.where(
              Sequelize.fn(
                "CONCAT_WS",
                " ",
                Sequelize.col("owners.first_name"),
                Sequelize.col("owners.middle_name"),
                Sequelize.col("owners.last_name")
              ),
              { [Op.iLike]: `%${searchTerm}%` }
            )
          );
        }
      }

      // Add search includes (make sure owners are included for search)
      const ownerIncludeIndex = includeConditions.findIndex(
        (inc) => inc.as === "owners"
      );
      if (ownerIncludeIndex !== -1) {
        includeConditions[ownerIncludeIndex].required = false; // LEFT JOIN for search
      }

      const documentIncludeIndex = includeConditions.findIndex(
        (inc) => inc.as === "documents"
      );
      if (documentIncludeIndex !== -1) {
        includeConditions[documentIncludeIndex].required = false; // LEFT JOIN for search
      }

      // Apply search conditions
      whereClause[Op.and] = [...(whereClause[Op.and] || []), searchConditions];
    }

    // ==================== SPECIFIC TEXT FILTERS ====================

    // Individual parcel number filter
    if (queryParams.parcel_number) {
      whereClause.parcel_number = {
        [Op.iLike]: `%${queryParams.parcel_number}%`,
      };
    }

    // Individual plot number filter
    if (queryParams.plot_number) {
      const documentInclude = includeConditions.find(
        (inc) => inc.as === "documents"
      );
      if (documentInclude) {
        documentInclude.where = {
          plot_number: { [Op.iLike]: `%${queryParams.plot_number}%` },
        };
        documentInclude.required = true;
      }
    }

    // Individual owner name filter
    if (queryParams.owner_name) {
      const ownerNameTerm = queryParams.owner_name.trim();
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");

      if (ownerInclude) {
        ownerInclude.where = {
          [Op.or]: [
            { first_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            { middle_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            { last_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            Sequelize.where(
              Sequelize.fn(
                "CONCAT_WS",
                " ",
                Sequelize.col("owners.first_name"),
                Sequelize.col("owners.middle_name"),
                Sequelize.col("owners.last_name")
              ),
              { [Op.iLike]: `%${ownerNameTerm}%` }
            ),
          ],
        };
        ownerInclude.required = true;
      }
    }

    // Individual national_id filter
    if (queryParams.national_id) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = {
          national_id: { [Op.iLike]: `%${queryParams.national_id}%` },
        };
        ownerInclude.required = true;
      }
    }

    // Individual phone_number filter
    if (queryParams.phone_number) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = {
          phone_number: { [Op.iLike]: `%${queryParams.phone_number}%` },
        };
        ownerInclude.required = true;
      }
    }

    // ==================== SORTING ====================

    let order = [["createdAt", "DESC"]];
    if (queryParams.sortBy && queryParams.sortOrder) {
      const validSortFields = [
        "parcel_number",
        "area",
        "land_use",
        "ownership_type",
        "record_status",
        "priority",
        "land_level",
        "lease_ownership_type",
        "ownership_category",
        "createdAt",
        "updatedAt",
      ];

      if (validSortFields.includes(queryParams.sortBy)) {
        const sortDirection =
          queryParams.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
        order = [[queryParams.sortBy, sortDirection]];
      }
    }

    // ==================== COUNT TOTAL RECORDS ====================

    const countIncludes = includeConditions
      .map((inc) => {
        // For count, make sure we don't require the includes (to avoid INNER JOIN)
        const includeCopy = { ...inc };
        if (includeCopy.required) {
          includeCopy.required = false;
        }
        return includeCopy;
      })
      .filter((inc) => inc.as !== "payments");

    const totalCount = await LandRecord.count({
      where: whereClause,
      include: countIncludes,
      distinct: true,
      col: "id",
    });

    // ==================== FETCH RECORDS ====================

    const landRecords = await LandRecord.findAll({
      where: whereClause,
      include: includeConditions,
      attributes: [
        "id",
        "parcel_number",
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "lease_transfer_reason",
        "area",
        "land_level",
        "record_status",
        "priority",
        "ownership_category",
        "has_debt",
        "administrative_unit_id",
        "created_by",
        "createdAt",
        "updatedAt",
      ],
      limit: pageSize,
      offset: offset,
      order: order,
      distinct: true,
      subQuery: false,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    // ==================== PROCESS RECORDS ====================

    const processedRecords = landRecords.map((record) => {
      const recordData = record.toJSON();

      // Process owners
      recordData.owners = recordData.owners
        ? recordData.owners.map((owner) => ({
            ...owner,
            ownership_percentage: owner.LandOwner?.ownership_percentage,
            verified: owner.LandOwner?.verified,
          }))
        : [];

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      // Create owner names string
      recordData.owner_names =
        recordData.owners
          ?.map((owner) =>
            `${owner.first_name || ""} ${owner.middle_name || ""} ${
              owner.last_name || ""
            }`.trim()
          )
          .join(", ") || "";

      // Get plot numbers from documents
      recordData.plot_numbers =
        recordData.documents
          ?.map((doc) => doc.plot_number)
          .filter(Boolean)
          .join(", ") || "";

      // Counts
      recordData.document_count = recordData.documents?.length || 0;
      recordData.payment_count = recordData.payments?.length || 0;

      // Administrative unit name
      recordData.administrative_unit_name =
        recordData.administrativeUnit?.name || "";

      return recordData;
    });

    // ==================== RETURN RESULT ====================

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

    const processedRecords = rows.map((record) => {
      const recordData = record.toJSON();

      const owners = (recordData.owners || []).map((owner) => ({
        ...owner,
        is_current_user: owner.id === userId,
      }));

      try {
        recordData.coordinates = recordData.coordinates
          ? JSON.parse(recordData.coordinates)
          : null;
      } catch (e) {
        recordData.coordinates = null;
      }

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
  const {
    page = 1,
    pageSize = 10,
    includeDeleted = false,
    queryParams = {},
  } = options;

  try {
    const offset = (page - 1) * pageSize;

    const whereClause = {
      administrative_unit_id: adminUnitId,
    };

    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    // ==================== HAS_DEBT FILTER ====================
    if (queryParams.has_debt !== undefined && queryParams.has_debt !== "") {
      whereClause.has_debt = queryParams.has_debt === "true";
    }

    // ==================== QUICK FILTERS ====================

    // Land characteristics
    if (queryParams.land_use) {
      whereClause.land_use = queryParams.land_use;
    }

    if (queryParams.land_level) {
      whereClause.land_level = queryParams.land_level;
    }

    // Ownership details
    if (queryParams.ownership_type) {
      whereClause.ownership_type = queryParams.ownership_type;
    }

    // Lease information
    if (queryParams.lease_ownership_type) {
      whereClause.lease_ownership_type = queryParams.lease_ownership_type;
    }

    if (queryParams.lease_transfer_reason) {
      whereClause.lease_transfer_reason = queryParams.lease_transfer_reason;
    }

    // ==================== RANGE FILTERS ====================

    // Area range filter
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

    // Date range filter
    if (queryParams.startDate || queryParams.endDate) {
      whereClause.createdAt = {};
      if (queryParams.startDate) {
        whereClause.createdAt[Op.gte] = new Date(queryParams.startDate);
      }
      if (queryParams.endDate) {
        whereClause.createdAt[Op.lte] = new Date(queryParams.endDate);
      }
    }

    // ==================== INCLUDE CONDITIONS ====================

    const includeConditions = [
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
    ];

    // ==================== ENHANCED GLOBAL SEARCH ====================

    if (queryParams.search) {
      // Clean and prepare search term
      let searchTerm = queryParams.search.trim();

      // Handle URL encoded characters
      try {
        searchTerm = decodeURIComponent(searchTerm);
      } catch (e) {}

      searchTerm = searchTerm.replace(/%25/g, "%");

      // Split search term by spaces to handle full names
      const searchTerms = searchTerm
        .split(/\s+/)
        .filter((term) => term.length > 0);

      // SIMPLIFIED AND IMPROVED SEARCH LOGIC
      const searchConditions = {
        [Op.or]: [
          // LandRecord fields
          { parcel_number: { [Op.iLike]: `%${searchTerm}%` } },

          // Document fields
          { "$documents.plot_number$": { [Op.iLike]: `%${searchTerm}%` } },

          // Owner national_id and phone (always include these)
          { "$owners.national_id$": { [Op.iLike]: `%${searchTerm}%` } },
          { "$owners.phone_number$": { [Op.iLike]: `%${searchTerm}%` } },
        ],
      };

      // ===== SIMPLIFIED NAME SEARCH =====
      if (searchTerms.length > 0) {
        // For single term, search across all name fields
        if (searchTerms.length === 1) {
          const term = searchTerms[0];
          searchConditions[Op.or].push(
            { "$owners.first_name$": { [Op.iLike]: `%${term}%` } },
            { "$owners.middle_name$": { [Op.iLike]: `%${term}%` } },
            { "$owners.last_name$": { [Op.iLike]: `%${term}%` } }
          );
        }
        // For multiple terms (full name), use more specific matching
        else {
          // Search for each term in any name field (OR logic)
          searchTerms.forEach((term) => {
            searchConditions[Op.or].push(
              { "$owners.first_name$": { [Op.iLike]: `%${term}%` } },
              { "$owners.middle_name$": { [Op.iLike]: `%${term}%` } },
              { "$owners.last_name$": { [Op.iLike]: `%${term}%` } }
            );
          });

          // Also search for the full combined name
          searchConditions[Op.or].push(
            Sequelize.where(
              Sequelize.fn(
                "CONCAT_WS",
                " ",
                Sequelize.col("owners.first_name"),
                Sequelize.col("owners.middle_name"),
                Sequelize.col("owners.last_name")
              ),
              { [Op.iLike]: `%${searchTerm}%` }
            )
          );
        }
      }

      // Add search includes (make sure owners are included for search)
      const ownerIncludeIndex = includeConditions.findIndex(
        (inc) => inc.as === "owners"
      );
      if (ownerIncludeIndex !== -1) {
        includeConditions[ownerIncludeIndex].required = false; // LEFT JOIN for search
      }

      const documentIncludeIndex = includeConditions.findIndex(
        (inc) => inc.as === "documents"
      );
      if (documentIncludeIndex !== -1) {
        includeConditions[documentIncludeIndex].required = false; // LEFT JOIN for search
      }

      // Apply search conditions
      whereClause[Op.and] = [...(whereClause[Op.and] || []), searchConditions];
    }

    // ==================== SPECIFIC TEXT FILTERS ====================

    // Individual parcel number filter
    if (queryParams.parcel_number) {
      whereClause.parcel_number = {
        [Op.iLike]: `%${queryParams.parcel_number}%`,
      };
    }

    // Individual plot number filter
    if (queryParams.plot_number) {
      const documentInclude = includeConditions.find(
        (inc) => inc.as === "documents"
      );
      if (documentInclude) {
        documentInclude.where = {
          ...documentInclude.where,
          plot_number: { [Op.iLike]: `%${queryParams.plot_number}%` },
        };
        documentInclude.required = true;
      }
    }

    // Individual owner name filter
    if (queryParams.owner_name) {
      const ownerNameTerm = queryParams.owner_name.trim();
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");

      if (ownerInclude) {
        ownerInclude.where = {
          ...ownerInclude.where,
          [Op.or]: [
            { first_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            { middle_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            { last_name: { [Op.iLike]: `%${ownerNameTerm}%` } },
            Sequelize.where(
              Sequelize.fn(
                "CONCAT_WS",
                " ",
                Sequelize.col("owners.first_name"),
                Sequelize.col("owners.middle_name"),
                Sequelize.col("owners.last_name")
              ),
              { [Op.iLike]: `%${ownerNameTerm}%` }
            ),
          ],
        };
        ownerInclude.required = true;
      }
    }

    // Individual national_id filter
    if (queryParams.national_id) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = {
          ...ownerInclude.where,
          national_id: { [Op.iLike]: `%${queryParams.national_id}%` },
        };
        ownerInclude.required = true;
      }
    }

    // Individual phone_number filter
    if (queryParams.phone_number) {
      const ownerInclude = includeConditions.find((inc) => inc.as === "owners");
      if (ownerInclude) {
        ownerInclude.where = {
          ...ownerInclude.where,
          phone_number: { [Op.iLike]: `%${queryParams.phone_number}%` },
        };
        ownerInclude.required = true;
      }
    }

    // ==================== SORTING ====================

    let order = [["createdAt", "DESC"]];
    if (queryParams.sortBy && queryParams.sortOrder) {
      const validSortFields = [
        "parcel_number",
        "area",
        "land_use",
        "ownership_type",
        "record_status",
        "priority",
        "land_level",
        "lease_ownership_type",
        "ownership_category",
        "createdAt",
        "updatedAt",
      ];

      if (validSortFields.includes(queryParams.sortBy)) {
        const sortDirection =
          queryParams.sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
        order = [[queryParams.sortBy, sortDirection]];
      }
    }

    // ==================== COUNT TOTAL RECORDS ====================

    const countIncludes = includeConditions
      .map((inc) => {
        // For count, make sure we don't require the includes (to avoid INNER JOIN)
        const includeCopy = { ...inc };
        if (includeCopy.required) {
          includeCopy.required = false;
        }
        return includeCopy;
      })
      .filter((inc) => inc.as !== "payments");

    const totalCount = await LandRecord.count({
      where: whereClause,
      include: countIncludes,
      distinct: true,
      col: "id",
    });

    // ==================== FETCH RECORDS ====================

    const landRecords = await LandRecord.findAll({
      where: whereClause,
      include: includeConditions,
      attributes: [
        "id",
        "parcel_number",
        "land_use",
        "ownership_type",
        "lease_ownership_type",
        "lease_transfer_reason",
        "area",
        "land_level",
        "record_status",
        "priority",
        "ownership_category",
        "has_debt",
        "administrative_unit_id",
        "createdAt",
        "updatedAt",
      ],
      limit: pageSize,
      offset: offset,
      order: order,
      distinct: true,
      subQuery: false,
    });

    const totalPages = Math.ceil(totalCount / pageSize);

    // ==================== PROCESS RECORDS ====================

    const processedRecords = landRecords.map((record) => {
      const recordData = record.toJSON();

      // Process owners
      recordData.owners = recordData.owners
        ? recordData.owners.map((owner) => ({
            ...owner,
            ownership_percentage: owner.LandOwner?.ownership_percentage,
            verified: owner.LandOwner?.verified,
          }))
        : [];

      // Calculate total payments
      recordData.total_payments =
        recordData.payments?.reduce(
          (sum, payment) => sum + parseFloat(payment.paid_amount || 0),
          0
        ) || 0;

      // Create owner names string
      recordData.owner_names =
        recordData.owners
          ?.map((owner) =>
            `${owner.first_name || ""} ${owner.middle_name || ""} ${
              owner.last_name || ""
            }`.trim()
          )
          .join(", ") || "";

      // Get plot numbers from documents
      recordData.plot_numbers =
        recordData.documents
          ?.map((doc) => doc.plot_number)
          .filter(Boolean)
          .join(", ") || "";

      // Counts
      recordData.document_count = recordData.documents?.length || 0;
      recordData.payment_count = recordData.payments?.length || 0;

      // Administrative unit name
      recordData.administrative_unit_name =
        recordData.administrativeUnit?.name || "";

      return recordData;
    });

    // ==================== RETURN RESULT ====================

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
    throw new Error(`የመሬት መዝገቦችን ማግኘት አልተቻለም: ${error.message}`);
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

    if (data.land_record && Object.keys(data.land_record).length > 0) {
      const previousStatus = existingRecord.record_status;
      const newStatus = RECORD_STATUSES.SUBMITTED;

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

      const updatePayload = {
        ...data.land_record,
        updated_by: updater.id,
        record_status: newStatus,
      };

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

    if (data.owners && data.owners.length > 0) {
      await userService.updateLandOwnersService(
        recordId,
        existingRecord.owners,
        data.owners,
        updater,
        { transaction: t }
      );
    }

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

    const currentHistory = Array.isArray(record.status_history)
      ? record.status_history
      : [];

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

    await record.update(updateData, { transaction: t });

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

    const emailPromises = record.owners.map(async (owner) => {
      if (owner.email) {
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
          <a href="${process.env.CLIENT_URL}/land-records/${record.id}" 
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

    await t.commit();

    Promise.allSettled(emailPromises).catch(() => {});

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
const moveToTrashService = async (
  recordId,
  user,
  deletion_reason,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    if (!deletion_reason || deletion_reason.trim().length < 5) {
      throw new Error("የመሰረዝ ምክንያት ቢያንስ 5 ቁምፊ መሆን አለበት።");
    }

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

    await record.destroy({ transaction: t });

    if (record.documents?.length) {
      for (const doc of record.documents) {
        await doc.destroy({ transaction: t });
      }
    }

    if (record.payments?.length) {
      for (const payment of record.payments) {
        await payment.destroy({ transaction: t });
      }
    }

    await LandOwner.destroy({
      where: { land_record_id: record.id },
      transaction: t,
    });

    if (!transaction) await t.commit();

    const trashedRecord = await LandRecord.findOne({
      where: { id: record.id },
      paranoid: false,
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [], paranoid: false },
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

    await Promise.all([
      record.restore({ transaction: t }),

      Document.restore({
        where: { land_record_id: recordId },
        transaction: t,
      }),

      LandPayment.restore({
        where: { land_record_id: recordId },
        transaction: t,
      }),
    ]);

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

    return await getLandRecordByIdService(recordId, { transaction: t });
  } catch (error) {
    if (!transaction && t) await t.rollback();

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
    const record = await LandRecord.findOne({
      where: { id: recordId },
      paranoid: false,
      transaction: t,
    });

    if (!record) throw new Error("መዝገብ አልተገኘም።");
    if (!record.deletedAt) throw new Error("መዝገብ በመጥፎ ቅርጫት ውስጥ አይደለም።");

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

    await record.update(
      {
        action_log: [...(record.action_log || []), newActionEntry],
      },
      {
        transaction: t,
      }
    );

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

const getLandRecordStats = async (adminUnitId, options = {}) => {
  try {
    const pLimit = (await import("p-limit")).default;

    const limit = pLimit(8);

    const baseWhere = { deletedAt: null };
    if (adminUnitId) baseWhere.administrative_unit_id = adminUnitId;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sysTasks = [
      limit(() => LandRecord.count({ where: baseWhere })),
      limit(() => Document.count({ where: { deletedAt: null } })),
      limit(() =>
        User.count({
          where: adminUnitId
            ? { administrative_unit_id: adminUnitId }
            : { administrative_unit_id: { [Op.ne]: null } },
        })
      ),
      limit(() => LandOwner.count({ distinct: true, col: "user_id" })),
    ];
    const [all_records, all_documents, all_system_users, all_land_owners] =
      await Promise.all(sysTasks);

    const result = {
      system: { all_records, all_documents, all_system_users, all_land_owners },
    };

    if (!adminUnitId) return result;

    const bind = { adminUnitId };

    // queries for land record stats within the specified administrative unit
    const [
      by_status,
      by_zoning,
      by_ownership,
      by_land_use,
      by_lease_ownership_type,
      by_lease_transfer_reason,
    ] = await Promise.all([
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
      // NEW: Lease ownership type query
      limit(() =>
        sequelize.query(
          `
      SELECT lease_ownership_type, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL 
        AND administrative_unit_id = $adminUnitId
        AND lease_ownership_type IS NOT NULL
      GROUP BY lease_ownership_type
      `,
          { type: sequelize.QueryTypes.SELECT, bind }
        )
      ),
      // NEW: Lease transfer reason query
      limit(() =>
        sequelize.query(
          `
      SELECT lease_transfer_reason, COUNT(*)::int AS count
      FROM "land_records"
      WHERE "deletedAt" IS NULL 
        AND administrative_unit_id = $adminUnitId
        AND lease_transfer_reason IS NOT NULL
      GROUP BY lease_transfer_reason
      `,
          { type: sequelize.QueryTypes.SELECT, bind }
        )
      ),
    ]);

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
        by_lease_ownership_type,
        by_lease_transfer_reason,
        area_stats: {
          total_area,
          by_zoning: area_by_zoning,
          by_land_use: area_by_land_use,
        },
        owners_count,
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
    const offset = (page - 1) * pageSize;

    const totalCount = await LandRecord.count({
      where: {
        ownership_type: OWNERSHIP_TYPES.MERET_BANK,
        administrative_unit_id: user.administrative_unit_id,
        deletedAt: null,
      },
    });

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
      order: [["createdAt", "DESC"]],
    });

    const totalPages = Math.ceil(totalCount / pageSize);

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
  getLandRecordsStatsByAdminUnit,
  getFilterOptionsService,
};
