const { createLeaseAgreementService, getLeaseAgreementService, getLeasedAreaReportService } = require('../services/leaseAgreementService');

const createLeaseAgreement = async (req, res) => {
    try {
        const result = await createLeaseAgreementService(req.body, req.user);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getLeaseAgreement = async (req, res) => {
    try {
        const result = await getLeaseAgreementService(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const getLeasedAreaReport = async (req, res) => {
    try {
        const result = await getLeasedAreaReportService(req.params.landRecordId);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

module.exports = {
    createLeaseAgreement,
    getLeaseAgreement,
    getLeasedAreaReport
};