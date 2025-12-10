const {
  sequelize,
  LandRecord,
  User,
  AdministrativeUnit,
  RECORD_STATUSES,
  DOCUMENT_TYPES,
  Document,
  LandOwner,
  LandPayment,
  PAYMENT_TYPES,
  OWNERSHIP_TYPES,
  Sequelize,
  ActionLog,
  Organization,
  LAND_PREPARATION,
  GeoCoordinate,
} = require("../models");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");
const { Op } = require("sequelize");
const userService = require("./userService");
const { sendEmail } = require("../utils/statusEmail");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { createCoordinates, updateCoordinatesService } = require("./geoCoordinateService");

const createLandRecordService = async (data, files, user, options = {}) => {
  const { transaction: externalTransaction, isImport = false } = options;
  const t = externalTransaction || (await sequelize.transaction());

  try {
    const {
      owners = [],
      land_record = {},
      documents = [],
      land_payment,
      organization_info = {},
      points = [],
    } = data;
    const adminunit = user.administrative_unit_id;

    if (!land_record.ownership_category) {
      throw new Error("የባለቤትነት ክፍል (ownership_category) መግለጽ አለበት።");
    }

    // Validate organization data if ownership category is organization
    if (land_record.ownership_category === "የድርጅት") {
      if (!organization_info.name) {
        throw new Error("የድርጅቱ ስም መግለጽ አለበት።");
      }
      if (!organization_info.organization_type) {
        throw new Error("የድርጅቱ አይነት መግለጽ አለበት።");
      }
      if (owners.length === 0) {
        throw new Error("የድርጅቱ መሪ (manager) መግለጽ አለበት።");
      }
    }

    // PLOT NUMBER UNIQUENESS CHECK FOR ALL OPERATIONS
    // Extract plot_number from documents array (first document's plot_number)
    const plotNumber = documents[0]?.plot_number;
    
    if (plotNumber) {
      // Check for duplicate plot_number in the same administrative unit
      const existingPlotDocument = await Document.findOne({
        where: {
          administrative_unit_id: adminunit,
          plot_number: plotNumber,
          deletedAt: null,
        },
        attributes: ["id", "plot_number", "land_record_id"],
        transaction: t,
      });

      if (existingPlotDocument) {
        // Fetch the associated land record to get parcel_number for better error message
        const existingLandRecord = await LandRecord.findOne({
          where: {
            id: existingPlotDocument.land_record_id,
            deletedAt: null,
          },
          attributes: ["parcel_number"],
          transaction: t,
        });

        const existingParcelNumber = existingLandRecord?.parcel_number || 'Unknown';
        throw new Error(
          `ይህ ካርታ ሰነድ ቁጥር (${plotNumber}) በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል። አሁን በዝግጅት ላይ ያለው መሬት ቁጥር: ${existingParcelNumber}`
        );
      }
    }

    // For imports, also check plot_number in documents table (redundant but keeps original logic)
    if (isImport) {
      if (!plotNumber) {
        throw new Error("የካርታ ሰነድ ቁጥር (plot_number) ከሰነዶች አልተገኘም።");
      }

      // The check above already handles this, but we keep the original logic for clarity
      const existingDocument = await Document.findOne({
        where: {
          administrative_unit_id: adminunit,
          plot_number: plotNumber,
          deletedAt: null,
        },
        attributes: ["id"],
        transaction: t,
      });

      if (existingDocument) {
        throw new Error(
          `ይህ ካርታ ሰነድ ቁጥር (${plotNumber}) በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።`
        );
      }
    } else {
      // Original duplicate check for parcel number (keep this for backward compatibility)
      const existingRecord = await LandRecord.findOne({
        where: {
          parcel_number: land_record.parcel_number,
          administrative_unit_id: adminunit,
          deletedAt: null,
        },
        transaction: t,
      });

      if (existingRecord) {
        throw new Error(
          `ይህ የመሬት ቁጥር (${land_record.parcel_number}) በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።`
        );
      }
    }

    // Helper function to convert absolute path to server relative path
    const getServerRelativePath = (file) => {
      if (!file || !file.path) return null;

      // If already has serverRelativePath, use it
      if (file.serverRelativePath) return file.serverRelativePath;

      // Convert absolute path to relative path from uploads directory
      const absolutePath = file.path;
      const uploadsIndex = absolutePath.indexOf("uploads" + path.sep);

      if (uploadsIndex !== -1) {
        return absolutePath.substring(uploadsIndex);
      }

      // If we can't extract relative path, return the original path
      return absolutePath;
    };

    // Process organization if ownership category is organization
    let organization = null;
    let managerUser = null;

    if (land_record.ownership_category === "የድርጅት") {
      // Create organization manager (first owner) as user
      const managerData = owners[0];

      const processManagerPhoto = () => {
        if (!files || !files.profile_picture) return managerData;

        let managerPhoto = null;

        // Handle single file or array of files
        if (Array.isArray(files.profile_picture)) {
          // For organization, only use the first profile picture (manager's photo)
          managerPhoto = getServerRelativePath(files.profile_picture[0]);
        } else {
          managerPhoto = getServerRelativePath(files.profile_picture);
        }

        return {
          ...managerData,
          profile_picture: managerPhoto,
        };
      };

      const managerWithPhoto = isImport ? managerData : processManagerPhoto();

      // Create manager user
      const createdManagers = await userService.createLandOwner(
        [
          {
            ...managerWithPhoto,
            email: managerWithPhoto.email?.trim() || null,
            address: managerWithPhoto.address?.trim() || null,
            administrative_unit_id: adminunit,
          },
        ],
        adminunit,
        user.id,
        { transaction: t }
      );

      managerUser = createdManagers[0];

      // Create organization
      organization = await Organization.create(
        {
          ...organization_info,
          user_id: managerUser.id,
          created_by: user.id,
          administrative_unit_id: adminunit,
        },
        { transaction: t }
      );

      // Set organization_id in land_record
      land_record.organization_id = organization.id;
    }

    // Process owners for non-organization cases
    const processOwnerPhotos = () => {
      if (!files || land_record.ownership_category === "የድርጅት") {
        // For organization, we already processed the manager, return empty or original
        return land_record.ownership_category === "የድርጅት" ? [] : owners;
      }

      const profilePictures = Array.isArray(files?.profile_picture)
        ? files.profile_picture.filter((file) => file && file.path)
        : files?.profile_picture && files.profile_picture.path
        ? [files.profile_picture]
        : [];

      return owners.map((owner, index) => ({
        ...owner,
        profile_picture: getServerRelativePath(profilePictures[index]) || null,
      }));
    };

    const ownersWithPhotos = isImport ? owners : processOwnerPhotos();

    // Skip status_history during import for performance
    const landRecordData = {
      ...land_record,
      administrative_unit_id: adminunit,
      created_by: user.id,
      record_status: RECORD_STATUSES.SUBMITTED,
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

    const landRecord = await LandRecord.create(landRecordData, {
      transaction: t,
    });

    // Skip ActionLog during import for performance
    if (!isImport) {
      await ActionLog.create(
        {
          land_record_id: landRecord.id,
          admin_unit_id: adminunit,
          performed_by: user.id,
          action_type: "RECORD_CREATED",
          notes: "የመሬት መዝገብ ተፈጥሯል",
          additional_data: {
            parcel_number: landRecord.parcel_number,
            plot_number: plotNumber, // Include plot number in log
            administrative_unit_id: adminunit,
            owners_count: owners.length,
            documents_count: documents.length,
            created_by_name: [user.first_name, user.middle_name, user.last_name]
              .filter(Boolean)
              .join(" "),
            initial_status: RECORD_STATUSES.SUBMITTED,
            action_description: "የመሬት መዝገብ ተፈጥሯል",
            ownership_category: landRecord.ownership_category,
            ...(landRecord.ownership_category === "የድርጅት" &&
              organization && {
                organization_name: organization.name,
                organization_id: organization.id,
              }),
          },
        },
        { transaction: t }
      );
    }

    // Handle owners creation
    let createdOwners = [];
    if (land_record.ownership_category !== "የድርጅት") {
      // For non-organization ownership, create all owners normally
      if (ownersWithPhotos.length > 0) {
        createdOwners = await userService.createLandOwner(
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

        // Use bulkCreate for land owners during import
        if (isImport && createdOwners.length > 0) {
          const landOwnerData = createdOwners.map((owner) => ({
            user_id: owner.id,
            land_record_id: landRecord.id,
            ownership_percentage:
              land_record.ownership_category === "የጋራ"
                ? 100 / createdOwners.length
                : 100,
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
        }
      }
    } else {
      // For organization ownership, we already created the manager
      // Link the organization manager to the land record
      if (organization && managerUser) {
        await LandOwner.create(
          {
            user_id: organization.user_id,
            land_record_id: landRecord.id,
            ownership_percentage: 100,
            verified: true,
            created_at: new Date(),
            is_organization_manager: true,
          },
          { transaction: t }
        );

        createdOwners = [managerUser];
      }
    }

    // === COORDINATE PROCESSING (NEW) ===
    let coordinateResult = null;
    if (points && Array.isArray(points) && points.length >= 3) {
      try {
        coordinateResult = await createCoordinates(
          {
            land_record_id: landRecord.id,
            points: points.map((pt, idx) => ({
              easting: pt.easting,
              northing: pt.northing,
              label: pt.label || `${idx + 1}`,
              description: pt.description || null,
            })),
          },
          t
        ); // Pass transaction

        // Update land record with calculated area and center
        await landRecord.update(
          {
            area_m2: coordinateResult.area_m2,
            perimeter_m: coordinateResult.perimeter_m,
            center_latitude: coordinateResult.center.latitude,
            center_longitude: coordinateResult.center.longitude,
          },
          { transaction: t }
        );

        // Add coordinate info to ActionLog if not import
        if (!isImport) {
          await ActionLog.create(
            {
              land_record_id: landRecord.id,
              admin_unit_id: adminunit,
              performed_by: user.id,
              action_type: "COORDINATES_CREATED",
              notes: "የመሬት ጂኦግራፊካ ኮኦርዲኔት ተመዝግቧል",
              additional_data: {
                coordinates_count: coordinateResult.coordinates.length,
                area_m2: coordinateResult.area_m2,
                perimeter_m: coordinateResult.perimeter_m,
                center_lat: coordinateResult.center.latitude,
                center_lng: coordinateResult.center.longitude,
                plot_number: plotNumber, // Include plot number in coordinate log
                action_description: `የመሬት ጂኦግራፊካ ኮኦርዲኔት ተመዝግቧል (${coordinateResult.area_m2} ሜ², ${coordinateResult.perimeter_m} ሜ)`,
              },
            },
            { transaction: t }
          );
        }
      } catch (coordError) {
        throw new Error(`የኮኦርዲኔት ዝርዝር መመዝገብ ስህተት: ${coordError.message}`);
      }
    } else if (points && points.length > 0 && points.length < 3) {
      throw new Error("የመሬት ጂኦግራፊካ ኮኦርዲኔት ቢያንስ 3 ነጥቦች ይጠይቃል።");
    }
    // ====================================

    // Document processing - FIXED FILE PATH HANDLING
    let documentResults = [];
    if (documents.length > 0) {
      // Handle document files properly
      let documentFiles = [];

      if (files && files.documents) {
        if (Array.isArray(files.documents)) {
          documentFiles = files.documents.filter((file) => file && file.path);
        } else if (files.documents.path) {
          documentFiles = [files.documents];
        }
      }

      if (!isImport) {
        // Normal document creation with proper relative paths
        documentResults = await Promise.all(
          documents.map((doc, index) => {
            const file = documentFiles[index];
            const relativePath = getServerRelativePath(file);

            return documentService.createDocumentService(
              {
                ...doc,
                administrative_unit_id: adminunit,
                land_record_id: landRecord.id,
                file_path: relativePath,
              },
              file ? [file] : [],
              user.id,
              { transaction: t }
            );
          })
        );
      } else {
        // Bulk create documents for imports
        const documentData = documents.map((doc) => ({
          ...doc,
          administrative_unit_id: adminunit,
          land_record_id: landRecord.id,
          created_by: user.id,
          createdAt: new Date(),
        }));

        const createdDocs = await Document.bulkCreate(documentData, {
          transaction: t,
        });
        documentResults = createdDocs.map((doc) => doc.toJSON());
      }
    }

    // ALWAYS CREATE LAND PAYMENT BASED ON LAND_PREPARATION TYPE
    let landPayment = null;

    // Determine payment type based on LAND_PREPARATION
    let paymentType = null;
    if (land_record.land_preparation) {
      if (land_record.land_preparation === "ሊዝ") {
        paymentType = "የሊዝ ክፍያ";
      } else if (land_record.land_preparation === "ነባር") {
        paymentType = "የግብር ክፍያ";
      } else {
        paymentType = null;
      }
    } else {
      paymentType = null;
    }

    // For organization, use organization manager as payer
    const payerId =
      land_record.ownership_category === "የድርጅት" && organization
        ? organization.user_id
        : createdOwners[0]?.id || null;

    // If ownership is government, payerId can be null. Otherwise require payerId.
    if (
      !payerId &&
      land_record.ownership_category !== "የመንግስት" &&
      land_record.ownership_category !== "የድርጅት"
    ) {
      throw new Error("የከፋይ መለያ አልተገኘም።");
    }

    // Create payment data - use provided values or defaults
    const paymentData = {
      payment_type: paymentType,
      total_amount: land_payment?.total_amount || 0,
      paid_amount: land_payment?.paid_amount || 0,
      payment_date: land_payment?.payment_date || new Date(),
      due_date: land_payment?.due_date || new Date(),
      receipt_number: land_payment?.receipt_number || null,
      land_record_id: landRecord.id,
      payer_id: payerId,
      created_by: user.id,
      payment_status: calculatePaymentStatus({
        total_amount: land_payment?.total_amount || 0,
        paid_amount: land_payment?.paid_amount || 0,
      }),
      ...land_payment,
    };

    landPayment = await landPaymentService.createLandPaymentService(
      paymentData,
      {
        transaction: t,
      }
    );

    if (!externalTransaction) {
      await t.commit();
    }

    return {
      landRecord: landRecord.toJSON(),
      owners: createdOwners.map((o) => o.toJSON()),
      documents: documentResults,
      landPayment: landPayment?.toJSON(),
      organization: organization?.toJSON(),
      coordinates: coordinateResult
        ? {
            points: coordinateResult.coordinates.map((c) => c.toJSON()),
            polygon: coordinateResult.polygon,
            center: coordinateResult.center,
            area_m2: coordinateResult.area_m2,
            perimeter_m: coordinateResult.perimeter_m,
          }
        : null,
      plot_number: plotNumber, // Include plot number in response
    };
  } catch (error) {
    if (!externalTransaction) {
      await t.rollback();
    }

    if (!isImport && files) {
      const cleanupFiles = Object.values(files)
        .flat()
        .filter((file) => file && file.path);
      cleanupFiles.forEach((file) => {
        try {
          if (file && file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (cleanupError) {
          // Silent fail - log but don't throw
        }
      });
    }

    throw new Error(`የመዝገብ መፍጠር ስህተት: ${error.message}`);
  }
};

//importLandRecordsFromXLSXService
const importLandRecordsFromXLSXService = async (filePath, user) => {
  const startTime = Date.now();
  let cleanupAttempted = false;

  // Define constants at the top level so they're accessible everywhere
  const BATCH_SIZE = 500; // Move this to top level
  const CONCURRENCY = 3;  // Move this to top level

  try {
    if (!user?.administrative_unit_id) {
      throw new Error("የተጠቃሚው አስተዳደራዊ ክፍል አልተገኘም።");
    }

    const adminUnitId = user.administrative_unit_id;

    // Stream and parse XLSX file
    console.log(`📊 Reading Excel file: ${filePath}`);
    const { validatedData, validationErrors } = await streamAndParseXLSX(filePath);

    if (validatedData.length === 0 && validationErrors.length === 0) {
      throw new Error("ፋይሉ ባዶ ነው ወይም ምንም የሚገባ ውሂብ አልተገኘም።");
    }

    if (validatedData.length === 0) {
      throw new Error("ሁሉም የተጻፉ ውሂቦች ስህተት አላቸው። ከላይ ያሉትን ስህተቶች ይመልከቱ።");
    }

    console.log(`✅ Validation complete: ${validatedData.length} valid rows, ${validationErrors.length} errors`);

    // Initialize results
    const results = {
      createdCount: 0,
      skippedCount: 0,
      totalRows: validatedData.length,
      errors: validationErrors,
      errorDetails: [],
      processingTime: 0,
      performance: {},
      progressUpdates: []
    };

    if (validatedData.length === 0) {
      throw new Error("ሁሉም ውሂቦች ባዶ ናቸው።");
    }

    // Create a single transaction for the entire import
    const mainTransaction = await sequelize.transaction();

    try {
      // Process in batches to avoid memory issues and track progress
      const totalBatches = Math.ceil(validatedData.length / BATCH_SIZE);
      
      console.log(`🔄 Starting import: ${validatedData.length} rows in ${totalBatches} batches (${BATCH_SIZE} rows per batch)`);
      
      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const batchStart = batchIndex * BATCH_SIZE;
        const batchEnd = Math.min(batchStart + BATCH_SIZE, validatedData.length);
        const batch = validatedData.slice(batchStart, batchEnd);
        const batchStartTime = Date.now();

        console.log(`🔄 Processing batch ${batchIndex + 1}/${totalBatches}: rows ${batchStart + 1}-${batchEnd}`);

        // Process batch with controlled concurrency
        const pLimit = (await import("p-limit")).default;
        const limiter = pLimit(CONCURRENCY);

        const batchResults = await Promise.all(
          batch.map((row, rowIndex) =>
            limiter(async () => {
              const absoluteIndex = batchStart + rowIndex;
              
              try {
                const transformedData = await transformXLSXData([row], adminUnitId);

                await createLandRecordService(
                  {
                    land_record: transformedData.landRecordData,
                    owners: transformedData.owners,
                    documents: transformedData.documents,
                    land_payment: transformedData.payments[0],
                    organization_info: transformedData.organization_info || null,
                  },
                  [],
                  user,
                  { 
                    isImport: true,
                    transaction: mainTransaction // Use the shared transaction
                  }
                );

                return { success: true, plotNumber: row.plot_number };
              } catch (error) {
                const detailedError = extractDetailedError(error, row.plot_number);
                return {
                  success: false,
                  plotNumber: row.plot_number,
                  error: detailedError,
                  row_data: row,
                  index: absoluteIndex
                };
              }
            })
          )
        );

        // Process batch results
        let batchCreated = 0;
        let batchSkipped = 0;
        
        batchResults.forEach((result, index) => {
          const absoluteIndex = batchStart + index;
          
          if (result.success) {
            batchCreated++;
          } else {
            batchSkipped++;
            const errorMessage = `ካርታ ${result.plotNumber}: ${result.error}`;
            results.errors.push(errorMessage);
            results.errorDetails.push({
              plot_number: result.plotNumber,
              error: result.error,
              row_data: result.row_data,
              index: absoluteIndex,
              timestamp: new Date().toISOString(),
              batch: batchIndex + 1
            });
          }
        });

        results.createdCount += batchCreated;
        results.skippedCount += batchSkipped;

        // Calculate batch performance
        const batchTime = (Date.now() - batchStartTime) / 1000;
        const rowsPerSecond = batch.length / batchTime;
        
        results.progressUpdates.push({
          stage: 'processing',
          message: `Batch ${batchIndex + 1}/${totalBatches}: ${batchCreated} created, ${batchSkipped} skipped`,
          timestamp: new Date().toISOString(),
          batch: batchIndex + 1,
          totalBatches: totalBatches,
          processed: batch.length,
          created: batchCreated,
          skipped: batchSkipped,
          rowsPerSecond: rowsPerSecond.toFixed(2),
          batchTime: `${batchTime.toFixed(2)}s`
        });

        console.log(`✅ Batch ${batchIndex + 1}/${totalBatches} complete: ${batchCreated} created, ${batchSkipped} skipped (${rowsPerSecond.toFixed(2)} rows/sec)`);

        // Force garbage collection hint (if available)
        if (global.gc) {
          global.gc();
        }
      }

      // Commit the transaction
      await mainTransaction.commit();
      console.log(`✅ Transaction committed successfully`);

      results.progressUpdates.push({
        stage: 'complete',
        message: `Import completed: ${results.createdCount} created, ${results.skippedCount} skipped`,
        timestamp: new Date().toISOString(),
        totalCreated: results.createdCount,
        totalSkipped: results.skippedCount
      });

    } catch (transactionError) {
      await mainTransaction.rollback();
      console.error('❌ Transaction rolled back:', transactionError.message);
      
      // Add transaction error to results
      results.errors.push(`Transaction error: ${transactionError.message}`);
      results.errorDetails.push({
        error: transactionError.message,
        timestamp: new Date().toISOString(),
        stage: 'transaction'
      });
      
      throw transactionError;
    }

    // Calculate performance metrics
    const endTime = Date.now();
    results.processingTime = (endTime - startTime) / 1000;
    
    results.performance = {
      rowsPerSecond: results.totalRows > 0 ? results.totalRows / results.processingTime : 0,
      rowsProcessed: results.createdCount,
      successRate: results.totalRows > 0 ? 
        ((results.createdCount / results.totalRows) * 100).toFixed(2) + "%" : "0%",
      totalTime: `${Math.round(results.processingTime)}s`,
      memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      batchesProcessed: Math.ceil(results.totalRows / BATCH_SIZE),
      averageBatchTime: (results.processingTime / Math.ceil(results.totalRows / BATCH_SIZE)).toFixed(2) + "s"
    };

    console.log(`📊 Import Performance Summary:`);
    console.log(`   Total time: ${results.performance.totalTime}`);
    console.log(`   Rows per second: ${results.performance.rowsPerSecond.toFixed(2)}`);
    console.log(`   Success rate: ${results.performance.successRate}`);
    console.log(`   Memory used: ${results.performance.memoryUsage}`);
    console.log(`   Batches processed: ${results.performance.batchesProcessed}`);
    console.log(`   Average batch time: ${results.performance.averageBatchTime}`);

    // Cleanup file
    cleanupAttempted = true;
    try {
      await fs.promises.unlink(filePath);
      console.log(`🗑️ Temporary file cleaned up: ${filePath}`);
    } catch (cleanupError) {
      console.warn(`⚠️ Could not delete temporary file: ${cleanupError.message}`);
    }

    return results;

  } catch (error) {
    // Cleanup file on error
    if (!cleanupAttempted) {
      try {
        await fs.promises.unlink(filePath);
      } catch (cleanupError) {
        console.warn(`⚠️ Could not delete temporary file after error: ${cleanupError.message}`);
      }
    }

    console.error("❌ Import failed:", error.message);
    
    const amharicErrors = ["የተጠቃሚው", "ምንም የሚገባ", "ሁሉም ውሂቦች", "ፋይሉ", "የተጻፉ"];
    const isAmharicError = amharicErrors.some((phrase) =>
      error.message.includes(phrase)
    );

    if (isAmharicError) {
      throw error;
    }

    throw new Error(`የ Excel ፋይል ማስገቢያ አልተሳካም: ${error.message}`);
  }
};
async function streamAndParseXLSX(filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Read workbook
      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        dense: false,
        sheetStubs: false,
        cellStyles: false,
        cellFormula: false,
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

      // Get all data at once (for smaller files this is fine)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,
        defval: null,
        blankrows: false,
      });

      console.log(`📊 Found ${jsonData.length} rows of data in Excel file (excluding header)`);

      if (jsonData.length === 0) {
        throw new Error("በ Excel ፋይሉ ውስጥ ምንም ውሂብ አልተገኘም።");
      }

      const validatedData = [];
      const validationErrors = [];
      let emptyRows = 0;
      let rowsWithPlotNumber = 0;

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 2; // +1 for header, +1 for 1-based index

        try {
          // Store original row number
          row.__rowNum__ = i;

          // Check if row is essentially empty (no meaningful data)
          const isEmptyRow = Object.keys(row).length === 0 || 
                            (Object.keys(row).length === 1 && row.__rowNum__ !== undefined);
          
          if (isEmptyRow) {
            emptyRows++;
            continue; // Skip empty rows entirely
          }

          // CRITICAL FIX: Check if plot_number exists in the row object
          // Excel might store it with different capitalization or spaces
          let plotNumberValue = row.plot_number;
          
          // If plot_number not found with exact key, try to find it
          if (plotNumberValue === undefined) {
            // Try alternative column names
            const possibleKeys = ['plot_number', 'plotnumber', 'plot number', 'plot', 'ቁጥር', 'ካርታ ቁጥር'];
            for (const key of possibleKeys) {
              if (row[key] !== undefined) {
                plotNumberValue = row[key];
                row.plot_number = plotNumberValue; // Normalize the key
                break;
              }
            }
          }

          // Now check if we have a plot number
          if (!plotNumberValue) {
            throw new Error(`ረድፍ ${rowNumber} የካርታ ቁጥር ያስፈልጋል።`);
          }

          rowsWithPlotNumber++;

          // Continue with other validations...
          if (!row.land_use) {
            throw new Error(`ረድፍ ${rowNumber} የመሬት አጠቃቀም ዓይነት ያስፈልጋል።`);
          }

          if (!row.ownership_type) {
            throw new Error(`ረድፍ ${rowNumber} የባለቤትነት ዓይነት ያስፈልጋል።`);
          }

          // Data normalization with validation
          row.plot_number = String(plotNumberValue).trim();
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
            row.plot_number === "" ||
            row.plot_number.toLowerCase() === "n/a"
          ) {
            throw new Error(`ረድፍ ${rowNumber} የካርታ ቁጥር ትክክለኛ አይደለም።`);
          }

          // Numeric fields with validation
          row.land_level = parseInt(row.land_level) || 1;
          if (row.land_level < 1 || row.land_level > 5) {
            throw new Error(`ረድፍ ${rowNumber} የመሬት ደረጃ በ1 እና 5 መካከል መሆን አለበት።`);
          }

          row.area = parseFloat(row.area) || 0;
          if (row.area < 0) {
            throw new Error(`ረድፍ ${rowNumber} ስፋት አሉታዊ መሆን አይችልም።`);
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
          const enhancedError = `${error.message} (ረድፍ ${rowNumber})`;
          validationErrors.push(enhancedError);
          
          // Log only first few errors to avoid console spam
          if (validationErrors.length <= 5) {
            console.warn(`⚠️ Row ${rowNumber} validation error:`, error.message);
          }
        }
      }

      console.log(`📈 Analysis:`);
      console.log(`   Total rows in file: ${jsonData.length}`);
      console.log(`   Empty rows skipped: ${emptyRows}`);
      console.log(`   Rows with plot number: ${rowsWithPlotNumber}`);
      console.log(`   Valid rows: ${validatedData.length}`);
      console.log(`   Validation errors: ${validationErrors.length}`);

      // If we have some valid data, proceed with import
      if (validatedData.length > 0) {
        console.log(`✅ Parsing completed: ${validatedData.length} valid rows, ${validationErrors.length} errors`);
        
        // Log summary of errors if there are many
        if (validationErrors.length > 5) {
          console.log(`⚠️ ${validationErrors.length} validation errors occurred. Showing first 5:`);
          validationErrors.slice(0, 5).forEach((error, index) => {
            console.log(`  ${index + 1}. ${error}`);
          });
        }
        
        resolve({ validatedData, validationErrors });
      } else {
        // If no valid data at all, check why
        if (rowsWithPlotNumber === 0) {
          console.error(`❌ No rows found with plot_number column`);
          console.log(`🔍 Available columns in first row:`, Object.keys(jsonData[0] || {}));
          
          // Try to help user identify the issue
          if (jsonData.length > 0 && jsonData[0]) {
            const firstRowKeys = Object.keys(jsonData[0]);
            console.log(`🔍 First row has these columns:`, firstRowKeys);
            
            // Look for potential plot number columns
            const potentialPlotColumns = firstRowKeys.filter(key => 
              key.toLowerCase().includes('plot') || 
              key.toLowerCase().includes('ቁጥር') ||
              key.toLowerCase().includes('number')
            );
            
            if (potentialPlotColumns.length > 0) {
              console.log(`💡 Found potential plot number columns:`, potentialPlotColumns);
              console.log(`💡 Try renaming column '${potentialPlotColumns[0]}' to 'plot_number'`);
            }
          }
          
          reject(new Error("ምንም የካርታ ቁጥር አልተገኘም። እባክዎ 'plot_number' የሚለው አምድ መኖሩን ያረጋግጡ።"));
        } else if (validationErrors.length > 0) {
          console.error(`❌ All ${validationErrors.length} rows failed validation`);
          reject(new Error(`ሁሉም ${validationErrors.length} የተጻፉ ውሂቦች ስህተት አላቸው። ከላይ ያሉትን ስህተቶች ይመልከቱ።`));
        } else {
          reject(new Error("ምንም የሚገባ ውሂብ አልተገኘም።"));
        }
      }

    } catch (error) {
      console.error("❌ Excel parsing failed:", error.message);

      // Provide more specific error messages
      if (error.message.includes("no such file") || error.message.includes("ENOENT")) {
        reject(new Error("ፋይሉ አልተገኘም። የቀረበው ፋይል መንገድ ትክክል መሆኑን ያረጋግጡ።"));
      } else if (error.message.includes("file format")) {
        reject(new Error("የቀረበው ፋይል ቅርጽ ትክክል አይደለም። እባክዎ ትክክለኛ Excel ፋይል (.xlsx ወይም .xls) ያስገቡ።"));
      } else if (error.message.includes("password")) {
        reject(new Error("ፋይሉ በይለፍ ቃል ተጠቅሷል። ያልተገደበ ፋይል ያስገቡ።"));
      } else {
        reject(new Error(`ፋይሉን ማንበብ አልተቻለም: ${error.message}`));
      }
    }
  });
}
function extractDetailedError(error, plotNumber) {
  // Early return for common cases to improve performance
  const errorMessage = error.message || "Unknown error";
  
  // Case 1: Sequelize validation errors (most common during imports)
  if (error.name === "SequelizeValidationError" && error.errors) {
    // Use string concatenation instead of array join for better performance
    let validationErrorStr = "የውሂብ ማረጋገጫ ስህተቶች: ";
    for (let i = 0; i < Math.min(error.errors.length, 3); i++) {
      const err = error.errors[i];
      const field = err.path || "unknown_field";
      const message = err.message || "Validation failed";
      if (i > 0) validationErrorStr += "; ";
      validationErrorStr += `${field}: ${message}`;
    }
    if (error.errors.length > 3) {
      validationErrorStr += `; እና ${error.errors.length - 3} ተጨማሪ ስህተቶች`;
    }
    return validationErrorStr;
  }

  // Case 2: Database constraint errors (PostgreSQL specific)
  if (error.original) {
    const dbError = error.original;

    // Check error codes first (fastest check)
    if (dbError.code === "23505") { // Unique constraint violation
      if (dbError.detail && dbError.detail.includes("plot_number")) {
        return `ይህ የካርታ ቁጥር (${plotNumber}) በዚህ መዘጋጃ ቤት ውስጥ ተመዝግቧል።`;
      }
      return "ድርብ መረጃ ተገኝቷል። አንዳንድ መረጃዎች ቀደም ሲል ተመዝግተዋል።";
    }

    if (dbError.code === "23503") { // Foreign key violation
      return "የተሳሳተ ማጣቀሻ መረጃ። አንዳንድ የተዛመዱ መረጃዎች አልተገኙም።";
    }

    if (dbError.code === "23514") { // Check constraint violation
      return "የውሂብ ገደብ ስህተት። አንዳንድ እሴቶች ተቀባይነት የላቸውም።";
    }

    if (dbError.code === "23502") { // Not null violation
      return "የግዴታ መስኮች ባዶ ናቸው። ሁሉንም አስፈላጊ መስኮች ይሙሉ።";
    }

    // Return original database message if it's meaningful
    if (dbError.message && !dbError.message.includes("Validation error")) {
      return dbError.message;
    }
  }

  // Case 3: Custom error messages from our transform/validation functions
  // Pre-compiled regex for Amharic error detection (better performance)
  const amharicErrorPattern = /ረድፍ|ያስፈልጋል|ትክክለኛ|መሆን አለበት|ስህተት|ባዶ|ቅርጽ|ይለፍ ቃል|ማንበብ|መዝገብ|ካርታ|መሬት|ባለቤትነት/;
  
  if (amharicErrorPattern.test(errorMessage)) {
    return errorMessage;
  }

  // Case 4: Network, timeout, or connection errors
  const networkErrorPattern = /timeout|ECONNREFUSED|Network|connection|socket|ETIMEDOUT|EHOSTUNREACH/i;
  if (networkErrorPattern.test(errorMessage)) {
    return "የውሂብ ጎታ ግንኙነት ስህተት። እባክዎ ከጥቂት ቅጽበት በኋላ እንደገና ይሞክሩ።";
  }

  // Case 5: File system errors (common during imports)
  const fileSystemPattern = /ENOENT|no such file|file not found|permission denied|EACCES/i;
  if (fileSystemPattern.test(errorMessage)) {
    return "የፋይል ስርዓት ስህተት። ፋይሉ አልተገኘም ወይም መዳረሻ የለውም።";
  }

  // Case 6: Memory errors (for large imports)
  const memoryPattern = /out of memory|heap|allocation|memory|exceeded/i;
  if (memoryPattern.test(errorMessage)) {
    return "የማህደረ ትውስታ ስህተት። ፋይሉ በጣም ትልቅ ሊሆን ይችላል። ወደ ትናንሽ ፋይሎች ይከፋፍሉት።";
  }

  // Case 7: Syntax or parsing errors
  const syntaxPattern = /syntax|parse|JSON|XML|format|invalid/i;
  if (syntaxPattern.test(errorMessage)) {
    return "የውሂብ ቅርጽ ስህተት። ፋይሉ በትክክል አልተቀየረም።";
  }

  // Case 8: Transaction/Deadlock errors
  const transactionPattern = /deadlock|transaction|lock|serialization/i;
  if (transactionPattern.test(errorMessage)) {
    return "የውሂብ ጎታ ክልከላ ስህተት። እባክዎ እንደገና ይሞክሩ።";
  }

  // Default: Clean up common technical terms for user-friendly message
  let cleanMessage = errorMessage
    .replace("Validation error", "የውሂብ ማረጋገጫ ስህተት")
    .replace("Sequelize", "")
    .replace("Error:", "")
    .replace("error:", "")
    .trim();

  // Add plot number context if available
  if (plotNumber && cleanMessage.length < 100) { // Only if message is not too long
    cleanMessage = `ካርታ ${plotNumber}: ${cleanMessage}`;
  }

  // Ensure message is not empty
  return cleanMessage || "ያልታወቀ ስህተት ተከስቷል።";
}
async function transformXLSXData(rows, adminUnitId) {
  try {
    const primaryRow = rows[0];

    // EARLY VALIDATION - Fast fail for missing critical fields
    if (!primaryRow.plot_number) {
      throw new Error("የካርታ ቁጥር ያስፈልጋል።");
    }
    if (!primaryRow.land_use) {
      throw new Error("የመሬት አጠቃቀም ዓይነት ያስፈልጋል።");
    }
    if (!primaryRow.ownership_type) {
      throw new Error("የባለቤትነት ዓይነት ያስፈልጋል።");
    }

    // OPTIMIZED HELPER FUNCTIONS (moved outside try block for reuse)
    const normalizeString = (value) => {
      if (value == null) return null; // Covers both undefined and null
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      const strValue = String(value).trim();
      return strValue.length > 0 ? strValue : null;
    };

    // Optimized boolean parser with Set for O(1) lookup
    const TRUE_VALUES = new Set(['true', '1', 'yes', 'አዎ', 'አዎን', 'ያለ']);
    const FALSE_VALUES = new Set(['false', '0', 'no', 'አይ', 'የለም']);
    
    const parseBooleanValue = (value) => {
      if (value == null || value === '') return null;
      if (typeof value === 'boolean') return value;
      
      const normalized = String(value).trim().toLowerCase();
      if (TRUE_VALUES.has(normalized)) return true;
      if (FALSE_VALUES.has(normalized)) return false;
      return null;
    };

    // Optimized date parser with regex for common formats
    const DATE_REGEX = /^\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/;
    const parseDateValue = (value) => {
      if (!value) return null;
      // Quick check for date-like strings
      if (typeof value === 'string' && DATE_REGEX.test(value)) {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? null : parsed;
      }
      // Handle Date objects and timestamps
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    // Optimized numeric parsers
    const parseIntegerValue = (value, defaultValue = 0) => {
      if (value == null || value === '') return defaultValue;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    };

    const parseFloatValue = (value, defaultValue = 0) => {
      if (value == null || value === '') return defaultValue;
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    };

    // EARLY DATA NORMALIZATION - Do this once at the beginning
    const plotNumber = normalizeString(primaryRow.plot_number);
    const landUse = normalizeString(primaryRow.land_use);
    const ownershipType = normalizeString(primaryRow.ownership_type);
    const ownershipCategory = normalizeString(primaryRow.ownership_category) || "የግል";
    
    // Fix common ownership category spelling early
    const finalOwnershipCategory = 
      (ownershipCategory === "የገራ" || ownershipCategory === "የጋር") 
        ? "የጋራ" 
        : ownershipCategory;

    let owners = [];
    let organizationInfo = null;

    // OWNER PROCESSING - Optimized with early returns and minimal object creation
    if (finalOwnershipCategory === "የድርጅት") {
      // Organization ownership
      const orgName = normalizeString(primaryRow.organization_name || primaryRow.name);
      const orgType = normalizeString(primaryRow.organization_type);
      const firstName = normalizeString(primaryRow.first_name);
      const middleName = normalizeString(primaryRow.middle_name);

      if (!orgName) {
        throw new Error("የድርጅቱ ስም ያስፈልጋል።");
      }
      if (!orgType) {
        throw new Error("የድርጅቱ አይነት ያስፈልጋል።");
      }
      if (!firstName || !middleName) {
        throw new Error("የድርጅቱ መሪ (manager) ስም እና የአባት ስም ያስፈልጋል።");
      }

      // Organization info - create minimal object
      organizationInfo = {
        name: orgName,
        organization_type: orgType,
        eia_document: normalizeString(primaryRow.eia_document),
        permit_number: normalizeString(primaryRow.organization_permit_number || primaryRow.permit_number),
        permit_issue_date: parseDateValue(primaryRow.organization_permit_issue_date || primaryRow.permit_issue_date),
      };

      // Manager (first owner)
      owners = [{
        first_name: firstName,
        middle_name: middleName,
        last_name: normalizeString(primaryRow.last_name) || "",
        national_id: normalizeString(primaryRow.national_id),
        email: normalizeString(primaryRow.email),
        gender: normalizeString(primaryRow.gender),
        phone_number: normalizeString(primaryRow.phone_number),
        relationship_type: normalizeString(primaryRow.relationship_type),
        address: normalizeString(primaryRow.address),
      }];
    } else {
      // Single or shared ownership
      const firstName = normalizeString(primaryRow.first_name);
      
      if (!firstName) {
        throw new Error("ዋና ባለቤት ስም ያስፈልጋል።");
      }

      owners = [{
        first_name: firstName,
        middle_name: normalizeString(primaryRow.middle_name) || "",
        last_name: normalizeString(primaryRow.last_name) || "",
        national_id: normalizeString(primaryRow.national_id),
        email: normalizeString(primaryRow.email),
        gender: normalizeString(primaryRow.gender),
        phone_number: normalizeString(primaryRow.phone_number),
        relationship_type: normalizeString(primaryRow.relationship_type),
        address: normalizeString(primaryRow.address),
      }];
    }

    // LAND RECORD DATA - Optimized with batch normalization
    // Validate numeric fields early
    const parsedLandLevel = parseIntegerValue(primaryRow.land_level, 1);
    if (parsedLandLevel < 1 || parsedLandLevel > 5) {
      throw new Error("የመሬት ደረጃ በ1 እና 5 መካከል መሆን አለበት።");
    }

    const parsedArea = parseFloatValue(primaryRow.area, 0);
    if (parsedArea < 0.1) {
      throw new Error("የመሬት ስፋት ቢያንስ 0.1 ካሬ ሜትር መሆን አለበት።");
    }

    // Create land record data with direct property assignment
    const landRecordData = {
      parcel_number: normalizeString(primaryRow.parcel_number),
      land_level: parsedLandLevel,
      area: parsedArea,
      administrative_unit_id: adminUnitId,
      north_neighbor: normalizeString(primaryRow.north_neighbor) || "north",
      east_neighbor: normalizeString(primaryRow.east_neighbor) || "east",
      south_neighbor: normalizeString(primaryRow.south_neighbor) || "south",
      west_neighbor: normalizeString(primaryRow.west_neighbor) || "west",
      land_use: landUse,
      ownership_type: ownershipType,
      zoning_type: normalizeString(primaryRow.zoning_type),
      block_number: normalizeString(primaryRow.block_number),
      block_special_name: normalizeString(primaryRow.block_special_name),
      ownership_category: finalOwnershipCategory,
      remark: normalizeString(primaryRow.remark),
      building_hight: normalizeString(primaryRow.building_hight),
      notes: normalizeString(primaryRow.notes),
      plan: normalizeString(primaryRow.plan),
      land_preparation: normalizeString(primaryRow.land_preparation),
      lease_transfer_reason: normalizeString(primaryRow.lease_transfer_reason),
      infrastructure_status: normalizeString(primaryRow.infrastructure_status),
      land_bank_code: normalizeString(primaryRow.land_bank_code),
      land_history: normalizeString(primaryRow.land_history),
      other_land_history: normalizeString(primaryRow.other_land_history),
      landbank_registrer_name: normalizeString(primaryRow.landbank_registrer_name),
      has_debt: parseBooleanValue(primaryRow.has_debt) ?? false,
      address: normalizeString(primaryRow.address),
      address_kebele: normalizeString(primaryRow.address_kebele),
      address_ketena: normalizeString(primaryRow.address_ketena),
    };

    // DOCUMENTS - Minimal object creation
    const documents = [{
      document_type: DOCUMENT_TYPES.TITLE_DEED,
      plot_number: plotNumber,
      approver_name: normalizeString(primaryRow.approver_name),
      verifier_name: normalizeString(primaryRow.verifier_name),
      preparer_name: normalizeString(primaryRow.preparer_name),
      shelf_number: normalizeString(primaryRow.shelf_number),
      box_number: normalizeString(primaryRow.box_number),
      file_number: normalizeString(primaryRow.file_number),
      reference_number: normalizeString(primaryRow.reference_number),
      description: normalizeString(primaryRow.description),
      issue_date: normalizeString(primaryRow.issue_date),
      files: [],
    }];

    // PAYMENTS - Optimized payment type derivation
    const landPreparation = landRecordData.land_preparation;
    let derivedPaymentType = PAYMENT_TYPES.PENALTY; // Default
    
    if (landPreparation === LAND_PREPARATION.LEASE) {
      derivedPaymentType = PAYMENT_TYPES.LEASE_PAYMENT;
    } else if (landPreparation === LAND_PREPARATION.EXISTING) {
      derivedPaymentType = PAYMENT_TYPES.TAX;
    }

    const payments = [{
      payment_type: derivedPaymentType,
      total_amount: parseFloatValue(primaryRow.total_amount, 0),
      paid_amount: parseFloatValue(primaryRow.paid_amount, 0),
      lease_year: parseIntegerValue(primaryRow.lease_year, 0),
      lease_payment_year: parseIntegerValue(primaryRow.lease_payment_year, 0),
      annual_payment: parseFloatValue(primaryRow.annual_payment, 0),
      initial_payment: parseFloatValue(primaryRow.initial_payment, 0),
      penalty_rate: parseFloatValue(primaryRow.penalty_rate, 0),
      remaining_amount: parseFloatValue(primaryRow.remaining_amount, 0),
      receipt_number: normalizeString(primaryRow.receipt_number),
      payment_date: parseDateValue(primaryRow.payment_date),
      currency: normalizeString(primaryRow.currency) || "ETB",
      payment_status: calculatePaymentStatus(primaryRow),
      description: normalizeString(primaryRow.description),
    }];

    return {
      owners,
      landRecordData,
      documents,
      payments,
      organization_info: organizationInfo,
    };
  } catch (error) {
    // Preserve original error with context
    const originalMessage = error.message || "Unknown error";
    throw new Error(`ውሂብ ማቀናበር አልተቻለም: ${originalMessage}`);
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
        "lease_transfer_reason",
        "land_preparation",
        "land_level",
        "record_status",
        "ownership_category",
      ],
      where: whereClause,
      group: [
        "land_use",
        "ownership_type",
        "lease_transfer_reason",
        "land_preparation",
        "land_level",
        "record_status",
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
      land_preparation: getSortedUniqueValues("land_preparation"),
      lease_transfer_reason: getSortedUniqueValues("lease_transfer_reason"),
      land_level: getSortedUniqueValues("land_level", "numerical"),
      record_status: getSortedUniqueValues("record_status"),
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
            "land_preparation",
            "lease_transfer_reason",
            "land_level",
          ],
        },
        status_filters: {
          label: "Status Filters",
          filters: ["record_status", "ownership_category"],
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
    // Simple date helper functions without timezone complexity
    const getStartOfDay = (date = new Date()) => {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      return start;
    };

    const getStartOfWeek = (date = new Date()) => {
      const startOfDay = getStartOfDay(date);
      const day = startOfDay.getDay();
      const diff = startOfDay.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
      const startOfWeek = new Date(startOfDay.setDate(diff));
      startOfWeek.setHours(0, 0, 0, 0);
      return startOfWeek;
    };

    const getStartOfMonth = (date = new Date()) => {
      const start = new Date(date.getFullYear(), date.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      return start;
    };

    const getStartOfYear = (date = new Date()) => {
      const start = new Date(date.getFullYear(), 0, 1);
      start.setHours(0, 0, 0, 0);
      return start;
    };

    // Current date calculations
    const now = new Date();

    // Today's range
    const todayStart = getStartOfDay(now);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // This week start
    const weekStart = getStartOfWeek(now);

    // This month start
    const monthStart = getStartOfMonth(now);

    // This year start
    const yearStart = getStartOfYear(now);

    // For trends - last periods
    const last12MonthsStart = new Date(monthStart);
    last12MonthsStart.setMonth(last12MonthsStart.getMonth() - 11);

    const last12WeeksStart = new Date(weekStart);
    last12WeeksStart.setDate(last12WeeksStart.getDate() - 7 * 11);

    const last3YearsStart = new Date(yearStart);
    last3YearsStart.setFullYear(last3YearsStart.getFullYear() - 2);

    // Execute all essential queries in parallel
    const [
      totalStats,
      timeBasedStats,
      landUseStats,
      ownershipStats,
      zoningStats,
      landLevelStats,
      infrastructureStats,
      landPreparationStats,
      landHistoryStats,
      monthlyTrends,
      weeklyTrends,
      yearlyTrends,
      leaseStats,
      recordStatusStats,
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
          [
            Sequelize.fn(
              "SUM",
              Sequelize.literal("CASE WHEN has_debt THEN 1 ELSE 0 END")
            ),
            "debt_count",
          ],
        ],
        raw: true,
      }),

      // 2. Time-based Statistics (Gregorian calendar)
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

      // 7. Infrastructure Status Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "infrastructure_status",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: ["infrastructure_status"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 8. Land Preparation Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "land_preparation",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: ["land_preparation"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 9. Land History Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "land_history",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: ["land_history"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 10. Monthly Trends (Last 12 months)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: last12MonthsStart },
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

      // 11. Weekly Trends (Last 12 weeks)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: last12WeeksStart },
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

      // 12. Yearly Trends (Last 3 years)
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
          createdAt: { [Op.gte]: last3YearsStart },
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

      // 13. Lease Analytics
      LandRecord.findAll({
        where: {
          administrative_unit_id: adminUnitId,
        },
        attributes: [
          "lease_transfer_reason",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
          [Sequelize.fn("AVG", Sequelize.col("area")), "average_area"],
        ],
        group: ["lease_transfer_reason"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 14. Record Status Distribution
      LandRecord.findAll({
        where: { administrative_unit_id: adminUnitId },
        attributes: [
          "record_status",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("area")), "total_area"],
        ],
        group: ["record_status"],
        order: [[Sequelize.fn("COUNT", Sequelize.col("id")), "DESC"]],
        raw: true,
      }),

      // 15. Recent Activity (last 10 records)
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
          "lease_transfer_reason",
          "ownership_type",
          "land_preparation",
          "area",
          "record_status",
          "zoning_type",
          "land_level",
          "infrastructure_status",
          "land_history",
          "building_hight",
          "has_debt",
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
        debt_records: parseInt(totalStats?.debt_count) || 0,
        area_unit: "square_meters",
      },

      time_analytics: {
        today: parseInt(timeBasedStats?.today_count) || 0,
        this_week: parseInt(timeBasedStats?.weekly_count) || 0,
        this_month: parseInt(timeBasedStats?.monthly_count) || 0,
        this_year: parseInt(timeBasedStats?.yearly_count) || 0,
        calendar_type: "gregorian",
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

        by_infrastructure_status: (infrastructureStats || []).map((item) => ({
          infrastructure_status: item.infrastructure_status || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_land_preparation: (landPreparationStats || []).map((item) => ({
          land_preparation: item.land_preparation || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_land_history: (landHistoryStats || []).map((item) => ({
          land_history: item.land_history || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          percentage:
            totalRecords > 0
              ? ((parseInt(item.count) / totalRecords) * 100).toFixed(1)
              : 0,
        })),

        by_record_status: (recordStatusStats || []).map((item) => ({
          record_status: item.record_status || "Unknown",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
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
          total_lease_records:
            leaseStats?.reduce((sum, item) => sum + parseInt(item.count), 0) ||
            0,
          lease_percentage:
            totalRecords > 0
              ? (
                  (leaseStats?.reduce(
                    (sum, item) => sum + parseInt(item.count),
                    0
                  ) /
                    totalRecords) *
                  100
                ).toFixed(1)
              : 0,
        },
        by_lease_type: (leaseStats || []).map((item) => ({
          lease_transfer_reason: item.lease_transfer_reason || "Not Specified",
          count: parseInt(item.count),
          total_area: parseFloat(item.total_area) || 0,
          average_area: parseFloat(item.average_area) || 0,
        })),
      },

      recent_activity: (recentActivity || []).map((record) => ({
        id: record.id,
        parcel_number: record.parcel_number,
        land_use: record.land_use,
        area: record.area,
        record_status: record.record_status,
        zoning_type: record.zoning_type,
        land_level: record.land_level,
        land_preparation: record.land_preparation,
        infrastructure_status: record.infrastructure_status,
        land_history: record.land_history,
        building_hight: record.building_hight,
        has_debt: record.has_debt,
        created_at: record.createdAt,
        owner_names:
          record.owners
            ?.map((owner) => `${owner.first_name} ${owner.last_name}`.trim())
            .filter((name) => name) || [],
      })),
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
            "gender",
            "marital_status",
            "relationship_type",
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
            "shelf_number",
            "box_number",
            "reference_number",
            "file_number",
            "issue_date",
            "isActive",
            "files",
            "verified_plan_number",
            "preparer_name",
            "verifier_name",
            "approver_name",
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
        {
          model: GeoCoordinate,
          as: "coordinates",
          attributes: [
            "easting",
            "northing",
            "latitude",
            "longitude",
            "sequence",
            "label",
          ],
          where: includeDeleted ? {} : { deletedAt: null },
          required: false,
          paranoid: !includeDeleted,
        },
        {
          model: Organization,
          as: "organization",
          attributes: [
            "name",
            "eia_document",
            "permit_number",
            "permit_issue_date"

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
          "profile_picture",
          "address",
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
        "land_level",
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
        "lease_transfer_reason",
        "area",
        "land_level",
        "record_status",
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

    if (queryParams.lease_transfer_reason) {
      whereClause.lease_transfer_reason = queryParams.lease_transfer_reason;
    }
    if (queryParams.land_preparation) {
      whereClause.land_preparation = queryParams.land_preparation;
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
          "profile_picture",
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
          "issue_date",
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
        "land_preparation",
        "record_status",
        "land_level",
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
        "land_preparation",
        "ownership_type",
        "lease_transfer_reason",
        "area",
        "land_level",
        "record_status",
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
            "profile_picture",
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
    // Load existing record with all related data including geo-coordinates
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
        {
          model: GeoCoordinate,
          as: "coordinates", 
          where: { deletedAt: null },
          required: false,
        },
      ],
      transaction: t,
    });

    if (!existingRecord) {
      throw new Error("Land record not found");
    }

    // Track if any updates were made
    let updatesMade = false;
    const updateOperations = [];

    // 1. Update land_record details
    if (data.land_record && Object.keys(data.land_record).length > 0) {
      updatesMade = true;
      updateOperations.push(
        (async () => {
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
        })()
      );
    }

    // 2. Update owners
    if (data.owners && data.owners.length > 0) {
      updatesMade = true;
      updateOperations.push(
        userService.updateLandOwnersService(
          recordId,
          existingRecord.owners,
          data.owners,
          updater,
          { transaction: t }
        )
      );
    }

    // 3. Update documents
    if (data.documents && data.documents.length > 0) {
      updatesMade = true;
      updateOperations.push(
        documentService.updateDocumentsService(
          recordId,
          existingRecord.documents,
          data.documents,
          files || [],
          updater,
          { transaction: t }
        )
      );
    }

    // 4. Update payments
    if (data.payments && data.payments.length > 0) {
      updatesMade = true;
      updateOperations.push(
        landPaymentService.updateLandPaymentsService(
          recordId,
          existingRecord.payments,
          data.payments,
          updater,
          { transaction: t }
        )
      );
    }

    // 5. Update coordinates 
    if (data.coordinates && data.coordinates.length > 0) {
      updatesMade = true;
      updateOperations.push(
        updateCoordinatesService(
          recordId,
          existingRecord.coordinates || [],
          data.coordinates,
          updater,
          { transaction: t }
        )
      );
    }

    if (!updatesMade) {
      throw new Error("No valid update data provided");
    }

    // Execute all update operations
    await Promise.all(updateOperations);

    if (!transaction) await t.commit();

    // Return updated record with all includes
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
      [RECORD_STATUSES.SUBMITTED]: [
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
    // Get admin_unit_id from logged-in user
    const userAdminUnitId = user.administrative_unit_id;

    if (!userAdminUnitId) {
      throw new Error(
        "Access denied. User does not belong to any administrative unit."
      );
    }

    const queryOptions = {
      where: {
        deletedAt: { [Op.ne]: null },
        administrative_unit_id: userAdminUnitId,
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
            "profile_picture",
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
        : error.message.includes("Access denied")
        ? error.message
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
  getAllLandRecordService,
  getLandRecordByIdService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  updateLandRecordService,
  getMyLandRecordsService,
  getLandRecordsByUserAdminUnitService,
  getLandRecordStats,
  getLandRecordsStatsByAdminUnit,
  getFilterOptionsService,
};
