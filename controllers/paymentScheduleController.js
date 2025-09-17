const {
  createTaxSchedules,
  createLeaseSchedules,
} = require("../services/paymentScheduleService");

const createTaxSchedulesController = async (req, res) => {
  try {
    const { dueDate, description } = req.body;
    if (!dueDate) {
      return res.status(400).json({ error: "የማጠናቀቂያ ጊዜ ያስገቡ" });
    }
    // Validate dueDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res
        .status(400)
        .json({ error: "dueDate must be in YYYY-MM-DD format" });
    }
    const schedules = await createTaxSchedules(dueDate, description || "");
    res.status(201).json({
      success: true,
      message: ` ${schedules.length} የግብር ክፍያ ቀጠሮዎች ተፈጥሯል`,
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
      return res.status(400).json({ error: " የክፍያ ማጠንቀቂያ ጊዜ ያስገቡ" });
    }
    // Validate dueDate format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return res
        .status(400)
        .json({ error: "dueDate must be in YYYY-MM-DD format" });
    }
    const schedules = await createLeaseSchedules(dueDate, description || "");
    res.status(201).json({
      success: true,
      message: ` ${schedules.length} የሊዝ ክፍያ ቀጠሮዎች ተፈጥሯል`,
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
