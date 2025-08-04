// const { body } = require('express-validator');

// exports.createLandValidation = [
//     body('land_level').isIn([1, 2, 3, 4, 5]).withMessage('Invalid land level.'),
//     body('owner_id').isInt().withMessage('Owner ID must be an integer.'),
//     body('administrative_unit_id').isInt().withMessage('Administrative unit ID must be an integer.'),
//     body('area').isFloat({ min: 0 }).withMessage('Area must be a positive number.'),
//     body('land_use').isIn([
//         'Residential', 'Mixed', 'Commercial', 'Administrative', 'Services',
//         'Manufacturing and Storage', 'Roads and Transportation', 'Urban Agriculture',
//         'Forestry', 'Entertainment and Playground', 'Other'
//     ]).withMessage('Invalid land use.'),
//     body('ownership_type').isIn([
//         'Court Order', 'Transfer of Title', 'Leasehold',
//         'Leasehold-Assignment', 'Pre-Existing-Undocumented', 'Displacement'
//     ]).withMessage('Invalid ownership type.'),
//     body('registration_date').notEmpty().withMessage('Registration date is required.'),
//     body('status').isIn(['Draft', 'Pending', 'Under Review', 'Approved', 'Rejected', 'Disputed'])
//         .withMessage('Invalid status.')
// ];

// exports.updateLandValidation = [
//     body('status').optional().isIn(['Draft', 'Pending', 'Under Review', 'Approved', 'Rejected', 'Disputed'])
//         .withMessage('Invalid status.')
// ];
