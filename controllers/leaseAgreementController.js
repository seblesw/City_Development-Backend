const { createLeaseAgreementService } = require('../services/leaseAgreementService');

const createLeaseAgreement = async (req, res) => {
  try {
    const result = await createLeaseAgreementService(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { createLeaseAgreement };