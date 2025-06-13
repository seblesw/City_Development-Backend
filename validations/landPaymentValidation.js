const { body } = require('express-validator');

const createLandPaymentValidation = [
    body('land_record_id').notEmpty().withMessage('Land record ID is required.'),
    body('payment_type').notEmpty().withMessage('Payment type is required.'),
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number.'),
    body('payment_due_date').notEmpty().withMessage('Payment due date is required.'),
    body('payment_status').notEmpty().withMessage('Payment status is required.'),
    body('recorded_by').notEmpty().withMessage('Recorder ID is required.'),
];

module.exports = {
    createLandPaymentValidation,
};
