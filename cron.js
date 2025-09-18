const cron = require('node-cron');
const { checkOverdueSchedules } = require('./services/paymentScheduleService');

cron.schedule('0 0 * * *', async () => {
  try {
    const penaltySchedules = await checkOverdueSchedules();
    console.log(`${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል`);
  } catch (error) {
    console.error('የቅጣት መርሃ ግብር ስህተት:', error.message);
  }
});