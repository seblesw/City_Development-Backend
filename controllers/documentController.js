const {
  createDocumentService,
  addFilesToDocumentService,
  getDocumentByIdService,
  updateDocumentService,
  deleteDocumentService,
} = require("../services/documentService");

const createDocumentController = async (req, res) => {
  try {
    const { body, files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "ቢያንስ አንዴ ፋይል መግለጥ አለበት።" });
    }
    const data = {
      map_number: body.map_number,
      document_type: body.document_type,
      reference_number: body.reference_number || null,
      description: body.description || null,
      issue_date: body.issue_date || null,
      land_record_id: body.land_record_id,
      preparer_name: body.preparer_name,
      approver_name: body.approver_name || null,
      isActive: body.isActive !== undefined ? body.isActive : true,
      inActived_reason: body.inActived_reason || null,
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

const addFilesToDocumentController = async (req, res) => {
  try {
    const { id } = req.params;
    const { files, user } = req;
    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "ቢያንስ አንዴ ፋይል መግለጥ አለበት።" });
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
      message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተገኝቷል።`,
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
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const data = {
      map_number: body.map_number,
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

module.exports = {
  createDocumentController,
  addFilesToDocumentController,
  getDocumentByIdController,
  updateDocumentController,
  deleteDocumentController,
};
