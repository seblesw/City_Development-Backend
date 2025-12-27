const { Document } = require("../models");
const {
  createDocumentService,
  addFilesToDocumentService,
  getDocumentByIdService,
  updateDocumentsService,
  deleteDocumentService,
  importPDFs,
  getAllDocumentService,
  toggleDocumentStatusService,
} = require("../services/documentService");

const createDocumentController = async (req, res) => {
  try {
    const { body, files, user } = req;
    
    
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "ቢያንስ አንዴ ፋይል መግለጥ አለበት።" });
    }
    const data = {
      map_number: body.map_number,
      document_type: body.document_type || null,
      shelf_number: body.shelf_number || null,
      box_number: body.box_number || null,
      reference_number: body.reference_number || null,
      file_number: body.file_number || null,
      description: body.description || null,
      issue_date: body.issue_date || null,
      land_record_id: Number(body.land_record_id) || null,
      preparer_name: body.preparer_name,
      approver_name: body.approver_name || null,
      isActive: body.isActive !== undefined ? body.isActive : true,
      inActived_reason: body.inActived_reason || null,
      plot_number: body.plot_number || null,
    };
    const result = await createDocumentService(data, files, user.id);
    return res.status(201).json({
      message: "ሰነድ በተሳካ ሁኔታ ተፈጥሯል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const getAllDocumentsController = async (req, res) => {
  try {
    const documents = await getAllDocumentService();
    return res.status(200).json({
      message: documents.message || "ሁሉም ሰነዶች በተሳካ ሁኔታ ተገኝተዋል",
      data: documents,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const importPDFDocuments = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Quick validation - check user first (fastest check)
    if (!req.user?.id) {
      return res.status(401).json({
        status: "error",
        message: "Authentication required"
      });
    }

    // Early file validation
    if (!req.files?.length) {
      return res.status(400).json({
        status: "error",
        message: "No files uploaded"
      });
    }

    const uploaderId = req.user.id;
    const adminUnitId = req.user.administrative_unit_id;
    const files = req.files;
    const totalFiles = files.length;

    
    console.log(`⚡ Processing ${totalFiles} files for user ${uploaderId}`);

    // Optimized file processing - parallelize filename decoding
    const processedFiles = await Promise.all(
      files.map(async (file) => {
        try {
          const filenameWithoutExt = file.originalname.replace(/\.pdf$/i, '');
          let decodedName = filenameWithoutExt;
          
          // Parallel decoding attempts
          const decodeAttempts = [
            () => decodeURIComponent(escape(filenameWithoutExt)),
            () => Buffer.from(filenameWithoutExt, 'binary').toString('utf8'),
            () => filenameWithoutExt // fallback
          ];
          
          for (const attempt of decodeAttempts) {
            try {
              decodedName = attempt();
              break; // Use first successful decode
            } catch {
              continue;
            }
          }
          
          // Normalize in one pass
          const normalizedName = decodedName
            .normalize("NFC")
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s_-]/gu, '')
            .trim();

          return {
            ...file,
            originalname: decodedName + '.pdf',
            filenameForMatching: normalizedName,
            cleanPlotNumber: normalizedName.replace(/[^\p{L}\p{N}]/gu, '')
          };
        } catch (error) {
          // Fast fallback - minimal processing
          const fallbackName = file.originalname.replace(/\.pdf$/i, '').trim();
          return {
            ...file,
            originalname: file.originalname,
            filenameForMatching: fallbackName,
            cleanPlotNumber: fallbackName.replace(/[^\w]/g, '')
          };
        }
      })
    );

    console.log(`📊 Files processed in ${Date.now() - startTime}ms`);
    
    // Call service with timing
    const serviceStart = Date.now();
    const result = await importPDFs({
      adminUnitId,
      files: processedFiles,
      uploaderId
    });
    const serviceTime = Date.now() - serviceStart;
    
    console.log(`✅ Service completed in ${serviceTime}ms`);

    // Pre-calculate values to avoid repeated calculations
    const successfulCount = result.updatedDocuments?.length || 0;
    const failedCount = result.unmatchedLogs?.length || 0;
    const skippedCount = result.skippedFiles?.length || 0;
    const successRate = totalFiles > 0 
      ? ((successfulCount / totalFiles) * 100).toFixed(1) + '%'
      : '0%';

    const totalTime = Date.now() - startTime;
    
    // Response with performance metrics
    const response = {
      status: "success",
      message: result.message || "Import completed",
      processingTime: `${(totalTime / 1000).toFixed(2)}s`,
      summary: {
        total: totalFiles,
        successful: successfulCount,
        failed: failedCount,
        skipped: skippedCount,
        successRate: successRate,
        performance: {
          filesPerSecond: (totalFiles / (totalTime / 1000)).toFixed(2),
          serviceTime: `${serviceTime}ms`,
          fileProcessingTime: `${(totalTime - serviceTime)}ms`
        }
      },
      details: {
        updatedDocuments: result.updatedDocuments || [],
        unmatchedLogs: result.unmatchedLogs || [],
        skippedFiles: result.skippedFiles || [],
        matchStatistics: result.matchStatistics || {}
      }
    };

    console.log(`🎯 Total processing: ${totalTime}ms (${successfulCount}/${totalFiles} successful)`);

    return res.status(200).json(response);

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    console.error(`❌ Import failed after ${totalTime}ms:`, error.message);
    
    // Return error with timing info
    return res.status(500).json({
      status: "error",
      message: "Import failed",
      processingTime: `${(totalTime / 1000).toFixed(2)}s`,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const addFilesToDocumentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ይህን ስራ ለመስራት ሎግ ኢን ያድርጉ!" });
    }
    const document = await addFilesToDocumentService(id, files, user.id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ሰነድ ፋይሎች በተሳካ ሁኔታ ተጨምረዋል።`,
      data: document,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const getDocumentByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const document = await getDocumentByIdService(id);
    return res.status(200).json({
      message: document.message || `ሰነድ በመለያ ቁጥር ${id} ተገኝተዋል`,
      data: document,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updateDocumentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "እባክዎ መጀመሪያ ሎጊን ያድርጉ!" });
    }
    const data = {
      plot_number: body.plot_number,
      document_type: body.document_type,
      shelf_number: body.shelf_number || null,
      box_number: body.box_number || null,
      reference_number: body.reference_number || null,
      file_number: body.file_number || null,
      description: body.description,
      issue_date: body.issue_date,
      land_record_id: body.land_record_id,
      preparer_name: body.preparer_name,
      approver_name: body.approver_name,
      isActive: body.isActive,
      inActived_reason: body.inActived_reason,
    };
    const document = await updateDocumentsService(id, data, files, user.id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተቀይሯል።`,
      data: document,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const deleteDocumentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const result = await deleteDocumentService(id, user.id);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const toggleDocumentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; 
    const userId = req.user.id;

    
    if (action === 'deactivate' && !reason) {
      return res.status(400).json({ 
        status: "error",
        message: "የኢን አክቲቭ ማድረጊያ ምክንያት ያስፈልጋል።" 
      });
    }

    const result = await toggleDocumentStatusService(id, action, userId, reason);

    return res.status(200).json({
      status: "success",
      data: result
    });

  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({
      status: "error",
      message: error.message
    });
  }
};

module.exports = {
  createDocumentController,
  toggleDocumentStatus,
  importPDFDocuments,
  getAllDocumentsController,
  addFilesToDocumentController,
  getDocumentByIdController,
  updateDocumentController,
  toggleDocumentStatus,
  deleteDocumentController,
};
