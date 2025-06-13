const { body } = require('express-validator');

exports.createDocumentValidation = [
    body('land_record_id').notEmpty().withMessage('Land record ID is required.'),
    body('document_name').notEmpty().withMessage('Document name is required.'),
    body('document_type').isIn(['Ownership Certificate', 'Title Deed', 'Survey Plan', 'Tax Receipt', 'Permit', 'Lease Agreement', 'Other'])
        .withMessage('Invalid document type.'),
    body('file_reference').notEmpty().withMessage('File reference is required.'),
    body('uploaded_by').notEmpty().withMessage('Uploader (user) ID is required.'),
];
