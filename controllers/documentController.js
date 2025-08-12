const { Document } = require("../models");
const {
  createDocumentService,
  addFilesToDocumentService,
  getDocumentByIdService,
  updateDocumentService,
  deleteDocumentService,
  importPDFs,
  inactivateDocumentService,
  getAllDocumentService,
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

    const result = await importPDFs({ files, uploaderId });

    return res.status(200).json({
      status: "success",
      message: result.message,
      updatedCount: result.updatedDocuments.length,
      updatedDocuments: result.updatedDocuments,
      unmatchedLogs: result.unmatchedLogs, 
    });
  } catch (error) {
    console.error("PDF Import Error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "PDF import failed",
      error: error.message,
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
    const document = await updateDocumentService(id, data, files, user.id);
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
const inactiveDocumentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { inActived_reason } = req.body; 
    const deactivator = req.user; 
    if (!deactivator || !deactivator.id) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    if (!inActived_reason) {
      return res.status(400).json({ error: "እባክዎ ምክንያት ያስገቡ።" });
    }
    const result = await inactivateDocumentService(deactivator, id, inActived_reason);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const activateDocumentController = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the document
    const document = await Document.findByPk(id);
    if (!document) {
      return res.status(404).json({ error: "የሰነድ መለያ ቁጥር አልተገኘም።" });
    }

    // Check if already active
    if (document.isActive) {
      return res.status(400).json({ error: "ይህ ሰነድ ቀድሞውኑ አልታገደም።" });
    }

    // Update document to active
    await document.update({
      inActived_reason: null,
      inactived_by: null,
      isActive: true
    });

    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተገኝቷል።`,
      data: document
    });

  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};


module.exports = {
  createDocumentController,
  activateDocumentController,
  importPDFDocuments,
  getAllDocumentsController,
  addFilesToDocumentController,
  getDocumentByIdController,
  updateDocumentController,
  inactiveDocumentController,
  deleteDocumentController,
};
