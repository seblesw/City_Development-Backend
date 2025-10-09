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
    // if (!user) {
    //   return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    // }
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "ቢያንስ አንዴ ፋይል መግለጥ አለበት።" });
    }
    // console.log("body",body, "files",files,"user", user )
    const data = {
      map_number: body.map_number,
      document_type: body.document_type || null,
      reference_number: body.reference_number || null,
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
  try {
    const uploaderId = req.user?.id;
    const files = req.files || [];
    
    console.log("Starting PDF import for", files.length, "files");
    console.log("File names:", files.map(f => f.originalname));

    // Process filenames with multiple encoding fallbacks
    const processedFiles = files.map(file => {
      let originalname = file.originalname;
      
      // Try multiple decoding strategies
      try {
        // Remove file extension for matching
        const filenameWithoutExt = originalname.replace(/\.pdf$/i, '');
        
        // Try UTF-8 decoding first
        originalname = decodeURIComponent(escape(filenameWithoutExt));
      } catch (error) {
        try {
          // Fallback to Buffer conversion
          originalname = Buffer.from(file.originalname, 'binary').toString('utf8').replace(/\.pdf$/i, '');
        } catch (e) {
          // Keep original if all decoding fails
          originalname = file.originalname.replace(/\.pdf$/i, '');
        }
      }
      
      return {
        ...file,
        originalname: originalname,
        filenameForMatching: originalname.normalize("NFC").trim()
      };
    });

    const result = await importPDFs({ 
      files: processedFiles, 
      uploaderId 
    });

    // Prepare detailed response
    const response = {
      status: "success",
      message: result.message,
      processedFiles: result.processedFiles || [],
      updatedCount: result.updatedDocuments.length,
      updatedDocuments: result.updatedDocuments,
      unmatchedLogs: result.unmatchedLogs,
      errorFiles: result.errorFiles || [],
      summary: {
        totalFiles: files.length,
        successful: result.updatedDocuments.length,
        failed: result.unmatchedLogs.length + (result.errorFiles?.length || 0),
        skipped: result.skippedFiles || 0
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("PDF Import Error:", error.message);
    console.error("Stack trace:", error.stack);
    
    return res.status(500).json({
      status: "error",
      message: "PDF import failed",
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
      reference_number: body.reference_number,
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

    // Validate deactivation reason
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
