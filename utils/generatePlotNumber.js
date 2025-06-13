// utils/generatePlotNumber.js
const generatePlotNumber = async (LandRecord) => {
  try {
    // Find the latest record
    const latestRecord = await LandRecord.findOne({
      order: [['id', 'DESC']],
    });

    let nextId = 1;

    if (latestRecord) {
      nextId = latestRecord.id + 1;
    }

    // Generate the plot number
    const plotNumber = `PLT-${String(nextId).padStart(4, '0')}`; // Example: PLT-0001

    return plotNumber;
  } catch (error) {
    throw new Error('Failed to generate plot number');
  }
};

module.exports = generatePlotNumber;
