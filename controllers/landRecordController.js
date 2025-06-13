const landService = require('../services/landRecordService');
const { validationResult } = require('express-validator');

exports.createLand = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const newLand = await landService.createLandService(req.body);
        res.status(201).json({ message: 'Land record created successfully', data: newLand });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllLand = async (req, res) => {
    try {
        const lands = await landService.getAllLandService();
        res.status(200).json({ data: lands });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getLandById = async (req, res) => {
    try {
        const land = await landService.getLandByIdService(req.params.id);
        if (!land) return res.status(404).json({ message: 'Land record not found.' });
        res.status(200).json({ data: land });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateLand = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const updatedLand = await landService.updateLandService(req.params.id, req.body);
        res.status(200).json({ message: 'Land record updated successfully', data: updatedLand });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteLand = async (req, res) => {
    try {
        await landService.deleteLandService(req.params.id);
        res.status(200).json({ message: 'Land record deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// exports.getLandByOwner = async (req, res) => {
//     try {
//         const lands = await landService.getLandByOwnerService(req.params.ownerId);
//         if (!lands || lands.length === 0) return res.status(404).json({ message: 'No land records found for this owner.' });
//         res.status(200).json({ data: lands });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };