const documentService = require('../services/documentService');

exports.createDocument = async (req, res) => {
    try {
        const document = await documentService.createDocumentService(req.body);
        res.status(201).json({ message: 'Document created successfully.', document });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllDocuments = async (req, res) => {
    try {
        const documents = await documentService.getAllDocumentsService();
        res.status(200).json(documents);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDocumentById = async (req, res) => {
    try {
        const document = await documentService.getDocumentByIdService(req.params.id);
        if (!document) return res.status(404).json({ message: 'Document not found.' });
        res.status(200).json(document);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateDocument = async (req, res) => {
    try {
        const document = await documentService.updateDocumentService(req.params.id, req.body);
        res.status(200).json({ message: 'Document updated successfully.', document });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteDocument = async (req, res) => {
    try {
        await documentService.deleteDocumentService(req.params.id);
        res.status(200).json({ message: 'Document deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
