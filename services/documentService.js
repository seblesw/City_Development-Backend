const {Document} = require('../models');

exports.createDocumentService = async (documentData) => {
    return await Document.create(documentData);
};

exports.getAllDocumentsService = async () => {
    return await Document.findAll();
};

exports.getDocumentByIdService = async (id) => {
    return await Document.findByPk(id);
};

exports.updateDocumentService = async (id, updateData) => {
    await Document.update(updateData, { where: { id } });
    return await Document.findByPk(id);
};

exports.deleteDocumentService = async (id) => {
    return await Document.destroy({ where: { id } });
};
