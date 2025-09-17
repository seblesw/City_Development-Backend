const { createTaxSchedules, createLeaseSchedules } = require('../services/paymentScheduleService');

const createTaxSchedulesController = async (req, res) => {
  try {
    const { dueDate, description } = req.body;
    if (!dueDate) {
      return res.status(400).json({ error: 'dueDate is required' });
    }
    // Validate dueDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
    }
    const schedules = await createTaxSchedules(dueDate, description || '');
    res.status(201).json({
      message: `Created ${schedules.length} tax schedules`,
      schedules,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createLeaseSchedulesController = async (req, res) => {
  try {
    const { dueDate, description } = req.body;
    if (!dueDate) {
      return res.status(400).json({ error: 'dueDate is required' });
    }
    // Validate dueDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'dueDate must be in YYYY-MM-DD format' });
    }
    const schedules = await createLeaseSchedules(dueDate, description || '');
    res.status(201).json({
      message: `Created ${schedules.length} lease schedules`,
      schedules,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createTaxSchedulesController,
  createLeaseSchedulesController,
};