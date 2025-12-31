const cron = require('node-cron');
const { checkOverdueSchedules } = require('./services/paymentScheduleService');

cron.schedule('* * * * *', async () => {
  try {
    const penaltySchedules = await checkOverdueSchedules();
  } catch (error) {
  }
});