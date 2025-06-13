const { body } = require('express-validator');

exports.createUserValidation = [
    body('first_name').notEmpty().withMessage('First name is required.'),
    body('middle_name').notEmpty().withMessage('Middle name is required.'),
    body('last_name').notEmpty().withMessage('Last name is required.'),
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters.'),
    body('role_id').notEmpty().withMessage('Role ID is required.'),
    body('phone').notEmpty().withMessage('Phone number is required.')
];