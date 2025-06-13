const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { createDocumentValidation } = require('../validations/documentValidation');
const validateRequest = require('../middlewares/validateRequest');

router.post('/', createDocumentValidation, validateRequest, documentController.createDocument);
router.get('/', documentController.getAllDocuments);
router.get('/:id', documentController.getDocumentById);
router.put('/:id', documentController.updateDocument);
router.delete('/:id', documentController.deleteDocument);

module.exports = router;
