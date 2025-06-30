const { sequelize, Document } = require("../models");
const path = require("path");

const createDocument = async (data, files, creatorId, transaction) => {
  const filesData = files.map((file) => ({
    file_path: path.join("uploads", file.filename),
    file_name: file.originalname,
    mime_type: file.mimetype,
    file_size: file.size,
  }));
  const documentData = {
    map_number: data.map_number,
    document_type: data.document_type,
    reference_number: data.reference_number || null,
    description: data.description || null,
    land_record_id: data.land_record_id,
    prepared_by: creatorId,
    approved_by: data.approved_by || null,
    isActive: true,
    files: filesData,
    created_at: new Date(),
  };
  return await Document.create(documentData, { transaction });
};

const getDocument = async (id) => {
  const document = await Document.findByPk(id);
  if (!document) throw new Error("ሰነዴ አልተገኘም።");
  return document;
};

const updateDocument = async (id, data, files, updaterId) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await Document.findByPk(id, { transaction });
    if (!document) throw new Error("ሰነዴ አልተገኘም።");
    const filesData = files
      ? files.map((file) => ({
          file_path: path.join("uploads", file.filename),
          file_name: file.originalname,
          mime_type: file.mimetype,
          file_size: file.size,
        }))
      : document.files;
    const updatedData = {
      ...data,
      files: files ? filesData : document.files,
      updated_at: new Date(),
    };
    await document.update(updatedData, { transaction });
    await transaction.commit();
    return document;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

const deleteDocument = async (id, deleterId) => {
  const transaction = await sequelize.transaction();
  try {
    const document = await Document.findByPk(id, { transaction });
    if (!document) throw new Error("ሰነዴ አልተገኘም።");
    await document.destroy({ transaction });
    await transaction.commit();
    return { message: "ሰነዴ በተሳካ ሁኔታ ተሰርዟል።" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { createDocument, getDocument, updateDocument, deleteDocument };