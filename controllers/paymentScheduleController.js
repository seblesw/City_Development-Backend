const { createTaxSchedules, createLeaseSchedules, checkOverdueSchedules, getSchedulesService } = require('../services/paymentScheduleService');

const getSchedulesController = async (req, res) => {
  try {
    const schedules = await getSchedulesService();
    res.status(200).json({ success: true, schedules });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createTaxSchedulesController = async (req, res) => {
  try {
    const { dueDate, description } = req.body;
    const userAdminUnitId = req.user.administrative_unit_id;

    // Input validation
    if (!dueDate) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ ያስገቡ' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ በ YYYY-MM-DD ቅርጸት መሆን አለበት' });
    }
    if (!userAdminUnitId) {
      return res.status(403).json({ error: 'የተጠቃሚ አስተዳደራዊ ክፍል አልተገኘም' });
    }

    // Validate due date is in the future
    const dueDateObj = new Date(dueDate);
    if (dueDateObj <= new Date()) {
      return res.status(400).json({ error: 'የማጠናቀቂያ ጊዜ የወደፊት ቀን መሆን አለበት' });
    }

    const schedules = await createTaxSchedules(dueDate, description || '', userAdminUnitId);
    
    res.status(201).json({
      success: true,
      message: `${schedules.length} የግብር ክፍያ ቀጠሮዎች በ${req.user.administrativeUnit?.name || 'የእርስዎ'} አስተዳደራዊ ክፍል ተፈጥሯል`,
      schedules: schedules.map(schedule => ({
        id: schedule.id,
        expected_amount: schedule.expected_amount,
        due_date: schedule.due_date,
        description: schedule.description
      })),
    });
  } catch (error) {
    console.error('Tax schedule creation error:', error);
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
    const { testDate } = req.body;
    const penaltySchedules = await checkOverdueSchedules(testDate);
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
  getSchedulesController
};