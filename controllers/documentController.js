const documentService = require("../services/documentService");

const createDocument = async (req, res) => {
  try {
    const { body, files, user } = req;
    const document = await documentService.createDocument(body, files, user.id, null);
    res.status(201).json({
      success: true,
      message: "ሰነዴ በተሳካ ሁኔታ ተፈጥሯል።",
      data: document,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ሰነዴ መፍጠር አልተሳካም።",
    });
  }
};

const getDocument = async (req, res) => {
  try {
    const document = await documentService.getDocument(req.params.id);
    res.status(200).json({ success: true, data: document });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message || "ሰነዴ አልተገኘም።",
    });
  }
};

const updateDocument = async (req, res) => {
  try {
    const { body, files, user } = req;
    const document = await documentService.updateDocument(req.params.id, body, files, user.id);
    res.status(200).json({
      success: true,
      message: "ሰነዴ በተሳካ ሁኔታ ተዘምኗል።",
      data: document,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ሰነዴ መዘመን አልተሳካም።",
    });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const result = await documentService.deleteDocument(req.params.id, req.user.id);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "ሰነዴ መሰረዝ አልተሳካም።",
    });
  }
};

module.exports = { createDocument, getDocument, updateDocument, deleteDocument };