const LandRecord = require('../models');
const generatePlotNumber= require('../utils/generatePlotNumber');
exports.createLandService = async (data) => {
  try {
    // Auto-generate plot number
    const plotNumber = await generatePlotNumber(LandRecord);

    // Create land record with generated plot number
    const landRecord = await LandRecord.create({
      ...data,
      plot_number: plotNumber,
    });

    return landRecord;
  } catch (error) {
    throw error;
  }
};

exports.getAllLandService = async () => {
    return await LandRecord.findAll();
};

exports.getLandByIdService = async (id) => {
    return await LandRecord.findByPk(id);
};

exports.updateLandService = async (id, updateData) => {
    const land = await LandRecord.findByPk(id);
    if (!land) throw new Error('Land record not found.');
    await land.update(updateData);
    return land;
};

exports.deleteLandService = async (id) => {
    const land = await LandRecord.findByPk(id);
    if (!land) throw new Error('Land record not found.');
    await land.destroy();
    return land;
};
