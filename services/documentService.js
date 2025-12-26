const {
  sequelize,
  Document,
  DOCUMENT_TYPES,
  LandRecord,
  User,
  Role,
  ActionLog,
} = require("../models");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs");

const createDocumentService = async (data, files, creatorId, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Validate required fields
    if (!data.plot_number) {
      throw new Error("የሰነድ መረጃዎች (plot_number) አስፈላጊ ናቸው።");
    }

    // CRITICAL: Add this validation
    if (!data.administrative_unit_id) {
      throw new Error("የአስተዳደር ክልል መታወቂያ (administrative_unit_id) አስፈላጊ ነው።");
    }

    // UPDATED: Check for duplicate plot_number within the same administrative unit
    const existingDocument = await Document.findOne({
      where: {
        plot_number: data.plot_number,
        administrative_unit_id: data.administrative_unit_id, 
        deletedAt: null,
      },
      transaction: t,
    });

    if (existingDocument) {
      // Fetch the associated land record to get parcel_number for better error message
      const existingLandRecord = await LandRecord.findOne({
        where: {
          id: existingDocument.land_record_id,
          deletedAt: null,
        },
        attributes: ["parcel_number"],
        transaction: t,
      });

      const existingParcelNumber = existingLandRecord?.parcel_number || 'Unknown';
      throw new Error(`ይህ የካርታ ቁጥር (${data.plot_number}) በዚህ መዘጋጃ ቤት ተመዝግቧል። አሁን በዝግጅት ላይ ያለው መሬት ቁጥር: ${existingParcelNumber}`);
    }

    if (!data.land_record_id || typeof data.land_record_id !== "number") {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ አስፈላጊ ነው።");
    }

    // Calculate version for this document
    const version =
      (await Document.count({
        where: {
          land_record_id: data.land_record_id,
          plot_number: data.plot_number,
          administrative_unit_id: data.administrative_unit_id,
          deletedAt: null,
        },
        transaction: t,
      })) + 1;

    // Process files
    const fileMetadata = [];
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        // Convert absolute path to server-relative path
        const serverRelativePath = path
          .relative(
            path.join(__dirname, ".."), 
            file.path
          )
          .split(path.sep)
          .join("/"); 

        fileMetadata.push({
          file_path: serverRelativePath,
          file_name:
            file.originalname ||
            `document_${Date.now()}${path.extname(file.originalname) || ""}`,
          mime_type: file.mimetype || "application/octet-stream",
          file_size: file.size || 0,
          uploaded_at: new Date(),
          uploaded_by: creatorId,
        });
      }
    }

    // UPDATED: Create the document with administrative_unit_id
    const document = await Document.create(
      {
        plot_number: data.plot_number,
        administrative_unit_id: data.administrative_unit_id, // <-- ADD THIS
        document_type: data.document_type || DOCUMENT_TYPES.TITLE_DEED,
        reference_number: data.reference_number,
        shelf_number: data.shelf_number || null,
        box_number: data.box_number || null,
        file_number: data.file_number || null,
        description: data.description,
        files: fileMetadata,
        version,
        land_record_id: data.land_record_id,
        verified_plan_number: data.verified_plan_number || null,
        preparer_name: data.preparer_name || null,
        verifier_name: data.verifier_name || null,
        approver_name: data.approver_name || null,
        issue_date: data.issue_date || null,
        uploaded_by: creatorId,
        isActive: true,
      },
      { transaction: t }
    );

    // Verify the land record exists
    const landRecord = await LandRecord.findByPk(data.land_record_id, {
      transaction: t,
      lock: true,
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገቡ አልተገኘም።");
    }

    // Get creator info for ActionLog
    let creator = null;
    try {
      creator = await User.findByPk(creatorId, {
        attributes: ["id", "first_name", "middle_name", "last_name"],
        transaction: t,
      });
    } catch (e) {
      creator = null;
    }
    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
};
const getAllDocumentService = async (options = {}) => {
  const { transaction } = options;
  try {
    const documents = await Document.findAll({
      where: { deletedAt: { [Op.eq]: null } },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
        {
          model: User,
          as: "uploader",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
        },
      ],
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "description",
        "issue_date",
        "land_record_id",
        "preparer_name",
        "approver_name",
        "isActive",
        "inActived_reason",
        "files",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });

    return documents || [];
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

const addFilesToDocumentService = async (
  id,
  files,
  updaterId,
  options = {}
) => {
  const { transaction } = options;
  let t = transaction;

  try {
    t = t || (await sequelize.transaction());

    if (!updaterId) {
      throw new Error("ፋይሎችን ለመጨመር የሚችሉት በ ስይስተሙ ከገቡ ብቻ ነው");
    }

    const document = await Document.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    if (!files || files.length === 0) {
      throw new Error("ቢያንስ አንድ ፋይል መጨመር አለበት።");
    }

    
    const normalizedExistingFiles = Array.isArray(document.files)
      ? document.files.map((file) =>
          typeof file === "string"
            ? {
                file_path: file,
                file_name: file.split("/").pop(),
                mime_type: "unknown",
                file_size: 0,
                uploaded_at: document.createdAt,
                uploaded_by: null,
              }
            : file
        )
      : [];

    
    const newFiles = files.map((file) => ({
      file_path: file.serverRelativePath,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      uploaded_at: new Date(),
      uploaded_by: updaterId,
    }));

    
    const updatedFiles = [...normalizedExistingFiles, ...newFiles];

    
    await document.update(
      {
        files: updatedFiles,
        isActive: true,
        inActived_reason: null,
      },
      { transaction: t }
    );

    
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      
      const updater = await User.findByPk(updaterId, {
        attributes: ["id", "first_name", "middle_name", "last_name"],
        transaction: t,
      });

      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: "ተጨማሪ ሰነድ ፋይሎች ተጨመሩ",
          changed_by: {
            id: updater.id,
            first_name: updater.first_name,
            middle_name: updater.middle_name,
            last_name: updater.last_name,
          },
          changed_at: new Date(),
          document_id: document.id,
          details: { files_added: newFiles.length },
        },
      ];
      await landRecord.save({ transaction: t });
    }

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ ፋይሎች መጨመር ስህተት: ${error.message}`);
  }
};
const importPDFs = async ({ files, uploaderId }) => {
  const results = {
    updatedDocuments: [],
    unmatchedLogs: [],
    errorFiles: [],
    processedFiles: [],
    skippedFiles: [],
    processingErrors: [],
    matchStatistics: {
      exact: 0,
      case_insensitive: 0,
      clean_special_chars: 0,
      fuzzy: 0,
      not_found: 0
    }
  };


  try {
    // Get all documents once for efficient matching
    const allDocuments = await Document.findAll();
    
    // Create optimized lookup maps
    const exactMatchMap = new Map();
    const normalizedMatchMap = new Map();
    const cleanMatchMap = new Map();

    allDocuments.forEach(doc => {
      if (!doc.plot_number) return;

      const plotNumber = doc.plot_number.trim();
      
      // Exact match
      exactMatchMap.set(plotNumber, doc);
      
      // Case-insensitive normalized match
      const normalized = plotNumber.toLowerCase().trim();
      if (!normalizedMatchMap.has(normalized)) {
        normalizedMatchMap.set(normalized, doc);
      }
      
      // Clean alphanumeric only match
      const cleanPlot = plotNumber.replace(/[^\p{L}\p{N}]/gu, "");
      if (cleanPlot && !cleanMatchMap.has(cleanPlot)) {
        cleanMatchMap.set(cleanPlot, doc);
      }
    });

    // Process files with proper uploaderId passing
    const BATCH_SIZE = 50;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i/BATCH_SIZE) + 1;
      
      const batchPromises = batch.map(async (file) => {
        return await processSingleFile(file, uploaderId, { 
          exactMatchMap,
          normalizedMatchMap,
          cleanMatchMap,
          allDocuments
        });
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      // Aggregate results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const fileResult = result.value;
          Object.keys(results).forEach(key => {
            if (Array.isArray(results[key]) && Array.isArray(fileResult[key])) {
              results[key].push(...fileResult[key]);
            }
          });
          // Update match statistics
          if (fileResult.matchType && fileResult.matchType !== 'not_found') {
            results.matchStatistics[fileResult.matchType]++;
          }
        } else {
          
        }
      });

    }

  } catch (error) {
    console.error('❌ PDF import service error:', error);
    throw error;
  }

  // Generate summary
  const summaryMessage = generateSummaryMessage(
    results.updatedDocuments.length, 
    results.unmatchedLogs.length, 
    results.skippedFiles.length
  );

  return {
    message: summaryMessage,
    ...results,
    summary: {
      total: files.length,
      successful: results.updatedDocuments.length,
      failed: results.unmatchedLogs.length,
      skipped: results.skippedFiles.length,
      processingErrors: results.processingErrors.length
    },
  };
};

// FIXED: Add uploaderId as separate parameter
async function processSingleFile(file, uploaderId, maps) {
  const result = {
    updatedDocuments: [],
    unmatchedLogs: [],
    errorFiles: [],
    processedFiles: [],
    skippedFiles: [],
    processingErrors: [],
    matchType: 'not_found'
  };

  try {
    // Skip files with processing errors from controller
    if (file.processingError) {
      result.processingErrors.push(`File processing error for ${file.originalname}: ${file.processingError}`);
      return result;
    }

    const plotNumberToMatch = file.filenameForMatching;
    const cleanPlotNumber = file.cleanPlotNumber;

    // Enhanced filename validation
    if (!plotNumberToMatch || plotNumberToMatch.trim() === "") {
      const errorMsg = `Invalid filename: '${file.originalname}' - cannot extract valid plot number`;
      result.unmatchedLogs.push(errorMsg);
      result.errorFiles.push({
        filename: file.originalname,
        error: "Invalid filename format - empty or malformed",
        plotNumberAttempted: plotNumberToMatch,
        type: "validation_error"
      });
      await safeFileDelete(file.path, file.originalname);
      return result;
    }

    // ENHANCED MATCHING STRATEGY WITH PRIORITY
    let document = null;
    let matchType = "not_found";

    const { exactMatchMap, normalizedMatchMap, cleanMatchMap, allDocuments } = maps;

    // 1. Exact match (highest priority)
    if (exactMatchMap.has(plotNumberToMatch)) {
      document = exactMatchMap.get(plotNumberToMatch);
      matchType = "exact";
      console.log(`✅ Exact match: ${plotNumberToMatch} -> ${document.plot_number}`);
    }
    
    // 2. Case-insensitive match
    else if (normalizedMatchMap.has(plotNumberToMatch.toLowerCase())) {
      document = normalizedMatchMap.get(plotNumberToMatch.toLowerCase());
      matchType = "case_insensitive";
      console.log(`✅ Case-insensitive match: ${plotNumberToMatch} -> ${document.plot_number}`);
    }
    
    // 3. Clean alphanumeric match
    else if (cleanPlotNumber && cleanMatchMap.has(cleanPlotNumber)) {
      document = cleanMatchMap.get(cleanPlotNumber);
      matchType = "clean_special_chars";
      console.log(`✅ Clean match: ${plotNumberToMatch} -> ${document.plot_number}`);
    }

    // 4. Enhanced fuzzy matching for Ethiopian characters and common issues
    if (!document) {
      const fuzzyMatch = allDocuments.find(doc => {
        if (!doc.plot_number) return false;
        
        const docPlot = doc.plot_number.trim();
        const filePlot = plotNumberToMatch.trim();
        
        // Generate common variations for fuzzy matching
        const variations = [
          docPlot,
          docPlot.replace(/[_-]/g, ' '), // underscores/hyphens to spaces
          docPlot.replace(/\s+/g, '_'), // spaces to underscores
          docPlot.replace(/\s+/g, '-'), // spaces to hyphens
          docPlot.replace(/[^\p{L}\p{N}]/gu, ''), // alphanumeric only
        ];
        
        return variations.some(variant => 
          variant.toLowerCase() === filePlot.toLowerCase() ||
          variant.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase() === 
            filePlot.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase()
        );
      });
      
      if (fuzzyMatch) {
        document = fuzzyMatch;
        matchType = "fuzzy";
        console.log(`✅ Fuzzy match: ${plotNumberToMatch} -> ${document.plot_number}`);
      }
    }

    if (!document) {
      const logMsg = `No document found matching: '${plotNumberToMatch}'. File: '${file.originalname}'.`;
      result.unmatchedLogs.push(logMsg);
      result.errorFiles.push({
        filename: file.originalname,
        plotNumberAttempted: plotNumberToMatch,
        cleanPlotNumber: cleanPlotNumber,
        error: "No matching document found after multiple matching strategies",
        matchAttempts: ["exact", "case_insensitive", "clean_special_chars", "fuzzy"],
        type: "no_match"
      });
      await safeFileDelete(file.path, file.originalname);
      return result;
    }

    result.matchType = matchType;

    // Enhanced duplicate checking
    const filesArray = Array.isArray(document.files)
      ? document.files.map(f => 
          typeof f === "string"
            ? {
                file_path: f,
                file_name: path.basename(f),
                mime_type: "application/pdf",
                file_size: 0,
                uploaded_at: new Date(),
                uploaded_by: null,
              }
            : f
        )
      : [];

    // Check for duplicate filename (case-insensitive)
    const fileNameExists = filesArray.some(f => 
      f.file_name && f.file_name.toLowerCase() === file.originalname.toLowerCase()
    );

    if (fileNameExists) {
      const skipMsg = `File '${file.originalname}' already exists for plot ${document.plot_number}. Skipping duplicate filename.`;
      result.unmatchedLogs.push(skipMsg);
      result.skippedFiles.push({
        filename: file.originalname,
        plotNumber: document.plot_number,
        documentId: document.id,
        reason: "Duplicate filename",
        matchType: matchType,
        type: "duplicate_filename"
      });
      await safeFileDelete(file.path, file.originalname);
      return result;
    }

    // Check for duplicate file path
    const serverRelativePath = file.serverRelativePath || file.path;
    const filePathExists = filesArray.some(f => f.file_path === serverRelativePath);

    if (filePathExists) {
      const skipMsg = `File path already exists in document: '${serverRelativePath}' for plot ${document.plot_number}`;
      result.unmatchedLogs.push(skipMsg);
      result.skippedFiles.push({
        filename: file.originalname,
        plotNumber: document.plot_number,
        documentId: document.id,
        reason: "Duplicate file path",
        matchType: matchType,
        type: "duplicate_file_path"
      });
      await safeFileDelete(file.path, file.originalname);
      return result;
    }

    // Add new file to document with enhanced metadata - NOW WITH UPLOADER ID
    const newFileMetadata = {
      file_path: serverRelativePath,
      file_name: file.originalname,
      mime_type: file.mimetype || "application/pdf",
      file_size: file.size,
      uploaded_at: new Date(),
      uploaded_by: uploaderId, // FIX: Now using the passed uploaderId
      import_timestamp: new Date().toISOString(),
      match_type: matchType
    };

    filesArray.push(newFileMetadata);

    // Update document - WITH UPLOADER ID
    await document.update({
      files: filesArray,
      updated_at: new Date(),
      uploaded_by: uploaderId, // FIX: Now using the passed uploaderId
    });

    // Track successful updates
    result.updatedDocuments.push({
      id: document.id,
      plot_number: document.plot_number,
      document_type: document.document_type,
      files_count: filesArray.length,
      new_file: newFileMetadata,
      match_type: matchType
    });

    result.processedFiles.push({
      filename: file.originalname,
      plotNumber: document.plot_number,
      documentId: document.id,
      status: "success",
      matchType: matchType
    });

    console.log(`✅ Successfully attached file to plot ${document.plot_number}`);

    // Update land record with enhanced logging
    await updateLandRecordActionLog(document, uploaderId, file, matchType);

  } catch (error) {
    const errorMsg = `Error processing file '${file.originalname}': ${error.message}`;
    result.unmatchedLogs.push(errorMsg);
    result.errorFiles.push({
      filename: file.originalname,
      plotNumberAttempted: file.filenameForMatching,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      type: "processing_error"
    });
    result.processingErrors.push(errorMsg);
    
    await safeFileDelete(file.path, file.originalname);
  }

  return result;
}

// Helper function for safe file deletion
const safeFileDelete = async (filePath, filename) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (deleteError) {
    // Don't throw, just log the warning
  }
};

// Helper function to update land record action log
const updateLandRecordActionLog = async (document, uploaderId, file, matchType) => {
  try {
    const landRecord = await LandRecord.findByPk(document.land_record_id);
    if (!landRecord) return;

    const actionLog = Array.isArray(landRecord.action_log) ? landRecord.action_log : [];

    let uploader = null;
    try {
      uploader = await User.findByPk(uploaderId, {
        attributes: ["id", "first_name", "middle_name", "last_name"],
      });
    } catch (userError) {
    }

    actionLog.push({
      action: `DOCUMENT_UPLOAD_${document.document_type || "PDF"}`,
      document_id: document.id,
      changed_by: uploader ? {
        id: uploader.id,
        first_name: uploader.first_name,
        middle_name: uploader.middle_name,
        last_name: uploader.last_name,
      } : { id: uploaderId },
      changed_at: new Date().toISOString(),
      details: {
        file_name: file.originalname,
        file_path: file.serverRelativePath || file.path,
        file_size: file.size,
        plot_number: document.plot_number,
        match_type: matchType,
        upload_method: "bulk_pdf_import"
      },
    });

    await landRecord.update({
      action_log: actionLog,
      updated_at: new Date(),
    });
  } catch (logError) {
  }
};

// Helper function for summary message
const generateSummaryMessage = (successful, unmatched, skipped) => {
  const parts = [];
  if (successful > 0) parts.push(`${successful} document(s) successfully updated`);
  if (unmatched > 0) parts.push(`${unmatched} file(s) could not be matched`);
  if (skipped > 0) parts.push(`${skipped} file(s) skipped (duplicates)`);
  
  return parts.length > 0 ? parts.join(', ') : 'No files processed';
};
const getDocumentByIdService = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, {
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
        {
          model: User,
          as: "uploader",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
        },
      ],
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "description",
        "issue_date",
        "land_record_id",
        "preparer_name",
        "approver_name",
        "isActive",
        "inActived_reason",
        "files",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }
    return document;
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};
const getDocumentsByLandRecordId = async (landRecordId, options = {}) => {
  const { transaction } = options;
  try {
    const documents = await Document.findAll({
      where: { land_record_id: landRecordId, deletedAt: { [Op.eq]: null } },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
      ],
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "description",
        "issue_date",
        "land_record_id",
        "preparer_name",
        "approver_name",
        "isActive",
        "inActived_reason",
        "files",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });

    
    return documents || [];
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};
const updateDocumentsService = async (
  landRecordId,
  existingDocuments,
  newDocumentsData,
  files,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    
    const landRecord = await LandRecord.findOne({
      where: { id: landRecordId },
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    await Promise.all(
      newDocumentsData.map(async (docData, index) => {
        const document = existingDocuments.find((d) => d.id === docData.id);
        if (!document) {
          throw new Error(`አይዲ ${docData.id} ያለው ሰነድ በዚህ መዝገብ አልተገኘም`);
        }

        
        const changes = {};
        const fileChanges = [];

        
        Object.keys(docData).forEach((key) => {
          if (
            document[key] !== docData[key] &&
            key !== "updated_at" &&
            key !== "created_at" &&
            key !== "files"
          ) {
            changes[key] = {
              from: document[key],
              to: docData[key],
            };
          }
        });

        
        const updatePayload = {
          ...docData,
          updated_by: updater.id,
        };

        
        if (files[index]) {
          
          const existingFiles = document.files ? [...document.files] : [];

          
          fileChanges.push({
            action: "ለማሻሻል ሰነድ ተጨምሯል",
            file_name: files[index].originalname,
            mime_type: files[index].mimetype,
          });

          
          existingFiles.push({
            file_path: files[index].path,
            file_name: files[index].originalname,
            mime_type: files[index].mimetype,
            uploaded_at: new Date(),
            uploaded_by: updater.id,
          });

          
          updatePayload.files = existingFiles;
        }

        await document.update(updatePayload, { transaction: t });

        
        if (Object.keys(changes).length > 0 || fileChanges.length > 0) {
          const currentLog = Array.isArray(landRecord.action_log)
            ? landRecord.action_log
            : [];
          const newLog = [
            ...currentLog,
            {
              action: "ሰነድ ተሻሽሏል",
              document_id: document.id,
              document_type: docData.document_type || document.document_type,
              changes: Object.keys(changes).length > 0 ? changes : undefined,
              file_changes: fileChanges.length > 0 ? fileChanges : undefined,
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
              where: { id: landRecordId },
              transaction: t,
            }
          );
        }
      })
    );

    if (!transaction) await t.commit();
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
  }
};
const deleteDocumentService = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    const document = await Document.findByPk(id, { transaction: t });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `ሰነድ ተሰርዟል_${document.document_type}`,
          changed_by: deleterId,
          changed_at: new Date(),
          document_id: documenተሰርዟል,
        },
      ];
      await landRecord.save({ transaction: t });
    }
    
    await document.destroy({ transaction: t });
    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መሰረዝ ስህተት: ${error.message}`);
  }
};
const toggleDocumentStatusService = async (
  documentId,
  action,
  userId,
  reason
) => {
  const document = await Document.findByPk(documentId);

  if (!document) {
    throw new Error("የሰነድ መለያ ቁጥር አልተገኘም።");
  }

  
  if (action === "activate" && document.isActive) {
    throw new Error("ይህ ሰነድ አስቀድሞ አክቲቭ ሁኗል");
  }
  if (action === "deactivate" && !document.isActive) {
    throw new Error("ይህ ሰነድ አስቀድሞ አክቲቭ አይደለም");
  }

  
  document.isActive = action === "activate";

  
  if (action === "deactivate") {
    document.inActived_reason = reason;
    document.inactived_by = userId;
  } else {
    document.inActived_reason = null;
    document.inactived_by = null;
  }

  await document.save();

  return {
    documentId: document.id,
    isActive: document.isActive,
    updatedAt: document.updatedAt,
    ...(!document.isActive && {
      deactivatedBy: userId,
      reason,
    }),
  };
};
module.exports = {
  createDocumentService,
  getAllDocumentService,
  getDocumentByIdService,
  importPDFs,
  addFilesToDocumentService,
  toggleDocumentStatusService,
  getDocumentByIdService,
  updateDocumentsService,
  deleteDocumentService,
  getDocumentsByLandRecordId,
};
