const { sequelize, Document } = require("../models");

const createDocument = async (data, files, creatorId, options = {}) => {
  const { transaction } = options;
  try {
    if (!data.map_number || !data.document_type || !files || files.length === 0) {
      throw new Error("የሰነድ መረጃዎች (map_number, document_type) እና ቢያንስ አንድ ፋይል መግለጽ አለባቸው።");
    }

    // Validate files
    const fileMetadata = files.map((file) => ({
      file_path: file.path,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
    }));

    const documentData = {
      map_number: data.map_number,
      document_type: data.document_type,
      reference_number: data.reference_number || null,
      description: data.description || null,
      files: fileMetadata,
      land_record_id: data.land_record_id,
      prepared_by: creatorId,
      approved_by: data.approved_by || null,
      issue_date: data.issue_date || null,
      isActive: true,
    };

    const document = await Document.create(documentData, { transaction });
    return document;
  } catch (error) {
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
};

const addFilesToDocument = async (id, files, updaterId, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, { transaction });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    if (!files || files.length === 0) {
      throw new Error("ቢያንስ አንዴ ፋይል መግለጥ አለበት።");
    }

    const newFiles = files.map((file) => ({
      file_path: file.path,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
    }));

    document.files = [...(document.files || []), ...newFiles];
    document.isActive = true; // Reactivate if previously deactivated
    document.inActived_reason = null;
    await document.save({ transaction });
    return document;
  } catch (error) {
    throw new Error(`የሰነድ ፋይሎች መጨመር ስህተት: ${error.message}`);
  }
};

const getDocumentById = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, {
      include: [
        { model: require("../models").LandRecord, as: "landRecord", attributes: ["id", "parcel_number"] },
        { model: require("../models").User, as: "preparer", attributes: ["id", "first_name", "last_name"] },
        { model: require("../models").User, as: "approver", attributes: ["id", "first_name", "last_name"] },
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

const updateDocument = async (id, data, files, updaterId, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, { transaction });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    const updateData = {};
    const updatableFields = ["map_number", "document_type", "reference_number", "description", "issue_date", "approved_by", "isActive", "inActived_reason"];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (files && files.length > 0) {
      const newFiles = files.map((file) => ({
        file_path: file.path,
        file_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      }));
      updateData.files = [...(document.files || []), ...newFiles];
    }

    updateData.updated_at = new Date();
    await document.update(updateData, { transaction });
    return document;
  } catch (error) {
    throw new Error(`የሰነድ መቀየር ስህተት: ${error.message}`);
  }
};

const deleteDocument = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, { transaction });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }
    await document.destroy({ transaction });
    return { message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    throw new Error(`የሰነድ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createDocument,
  addFilesToDocument,
  getDocumentById,
  updateDocument,
  deleteDocument,
};