const { createTaxSchedules, createLeaseSchedules, checkOverdueSchedules } = require('../services/paymentScheduleService');

const createTaxSchedulesController = async (req, res) => {
  try {
    const { dueDate, description } = req.body;
    if (!dueDate) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ ያስገቡ' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ በ YYYY-MM-DD ቅርጸት መሆን አለበት' });
    }
    const schedules = await createTaxSchedules(dueDate, description || '');
    res.status(201).json({
      success: true,
      message: `${schedules.length} የግብር ክፍያ ቀጠሮዎች ተፈጥሯል`,
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
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ ያስገቡ' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ በ YYYY-MM-DD ቅርጸት መሆን አለበት' });
    }
    const schedules = await createLeaseSchedules(dueDate, description || '');
    res.status(201).json({
      success: true,
      message: `${schedules.length} የሊዝ ክፍያ ቀጠሮዎች ተፈጥሯል`,
      schedules,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const checkOverdueSchedulesController = async (req, res) => {
  try {
    const penaltySchedules = await checkOverdueSchedules();
    res.status(200).json({
      success: true,
      message: `${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል`,
      schedules: penaltySchedules,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createTaxSchedulesController,
  createLeaseSchedulesController,
  checkOverdueSchedulesController,
};