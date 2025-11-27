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
    const document = await createDocumentService(data, files, user.id);
    return res.status(201).json({
      message: "ሰነድ በተሳካ ሁኔታ ተፈጥሯል።",
      data: document,
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
  let processedFiles = [];

  try {
    const uploaderId = req.user?.id;
    const files = req.files || [];

    if (!files.length) {
      return res.status(400).json({
        status: "error",
        message: "No files uploaded for processing"
      });
    }

    console.log(`📁 Processing ${files.length} PDF files`);

    // Use your original filename processing logic - this is critical for Amharic/English
    processedFiles = files.map(file => {
      let originalname = file.originalname;
      let processingError = null;
      
      try {
        // Your original decoding strategy - keep this exactly as it was
        const filenameWithoutExt = originalname.replace(/\.pdf$/i, '');
        
        // Multiple decoding strategies with fallbacks (ORIGINAL LOGIC)
        try {
          originalname = decodeURIComponent(escape(filenameWithoutExt));
        } catch (decodeError) {
          try {
            originalname = Buffer.from(filenameWithoutExt, 'binary').toString('utf8');
          } catch (bufferError) {
            originalname = filenameWithoutExt;
          }
        }
        
        // Enhanced normalization for better matching (ORIGINAL LOGIC)
        const normalizedName = originalname
          .normalize("NFC")
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[^\p{L}\p{N}\s_-]/gu, '')
          .trim();

        return {
          ...file,
          originalname: originalname,
          filenameForMatching: normalizedName,
          cleanPlotNumber: normalizedName.replace(/[^\p{L}\p{N}]/gu, ''),
          processingError: null
        };
      } catch (error) {
        // Fallback processing with basic cleaning (ORIGINAL LOGIC)
        const fallbackName = file.originalname.replace(/\.pdf$/i, '').trim();
        return {
          ...file,
          originalname: fallbackName,
          filenameForMatching: fallbackName,
          cleanPlotNumber: fallbackName.replace(/[^\w]/g, ''),
          processingError: error.message
        };
      }
    });

    console.log(`🔄 Starting PDF import for ${processedFiles.length} files`);
    const result = await importPDFs({ 
      files: processedFiles, 
      uploaderId 
    });

    const processingTime = (Date.now() - startTime) / 1000;
    
    const response = {
      status: "success",
      message: result.message,
      processingTime: `${processingTime}s`,
      performance: {
        filesPerSecond: (files.length / processingTime).toFixed(2),
        totalFiles: files.length
      },
      updatedCount: result.updatedDocuments.length,
      updatedDocuments: result.updatedDocuments,
      unmatchedLogs: result.unmatchedLogs,
      errorFiles: result.errorFiles,
      skippedFiles: result.skippedFiles,
      processingErrors: result.processingErrors,
      summary: {
        totalFiles: files.length,
        successful: result.updatedDocuments.length,
        failed: result.unmatchedLogs.length,
        skipped: result.skippedFiles.length,
        processingErrors: result.processingErrors?.length || 0,
        successRate: ((result.updatedDocuments.length / files.length) * 100).toFixed(1) + '%',
        matchStatistics: result.matchStatistics
      },
      timestamp: new Date().toISOString()
    };

    console.log(`✅ PDF import completed in ${processingTime}s: ${result.updatedDocuments.length}/${files.length} successful`);
    
    return res.status(200).json(response);
  } catch (error) {
    const processingTime = (Date.now() - startTime) / 1000;
    console.error(`❌ PDF import failed after ${processingTime}s:`, error.message);
    
    return res.status(500).json({
      status: "error",
      message: "PDF import failed",
      processingTime: `${processingTime}s`,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper function for cleanup
async function cleanupFilesOnError(files) {
  const cleanupPromises = files.map(file => 
    safeFileDelete(file.path, file.originalname).catch(() => {})
  );
  await Promise.allSettled(cleanupPromises);
}
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
