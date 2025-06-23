const { Op } = require("sequelize");
const { Region, Zone, Woreda } = require("../models");
exports.createRegionService = async (data, userId, transaction) => {
  const { name } = data;
  try {
    const existingRegion = await Region.findOne({ where: { name, deleted_at: { [Op.eq]: null } }, transaction });
    if (existingRegion) throw new Error("ይህ ስም ያለው ክልል ተመዝግቧል።");
    return await Region.create({ name, created_by: userId }, { transaction });
  } catch (error) {
    throw new Error(error.message || "ክልል መፍጠር አልተሳካም።");
  }
};

exports.getAllRegionsService = async () => {
  try {
    return await Region.findAll({
      where: { deleted_at: { [Op.eq]: null } },
      include: [
        { model: Zone, as: "zones", where: { deleted_at: { [Op.eq]: null } }, required: false, include: [
          { model: Woreda, as: "woredas", where: { deleted_at: { [Op.eq]: null } }, required: false }
        ] }
      ]
    });
  } catch (error) {
    throw new Error(error.message || "ክልሎችን ማግኘት አልተሳካም።");
  }
};

exports.getRegionByIdService = async (id) => {
  try {
    const region = await Region.findByPk(id, {
      include: [
        { model: Zone, as: "zones", where: { deleted_at: { [Op.eq]: null } }, required: false, include: [
          { model: Woreda, as: "woredas", where: { deleted_at: { [Op.eq]: null } }, required: false }
        ] }
      ]
    });
    if (!region) throw new Error("ክልል አልተገኘም።");
    return region;
  } catch (error) {
    throw new Error(error.message || "ክልል ማግኘት አልተሳካም።");
  }
};

exports.updateRegionService = async (id, data, userId, transaction) => {
  const { name } = data;
  try {
    const region = await Region.findByPk(id, { transaction });
    if (!region) throw new Error("ክልል አልተገኘም።");
    if (name && name !== region.name) {
      const existingRegion = await Region.findOne({ where: { name, deleted_at: { [Op.eq]: null } }, transaction });
      if (existingRegion) throw new Error("ይህ ስም ያለው ክልል ተመዝግቧል።");
    }
    await region.update({ name, updated_by: userId }, { transaction });
    return region;
  } catch (error) {
    throw new Error(error.message || "ክልል ማዘመን አልተሳካም።");
  }
};

exports.deleteRegionService = async (id, userId, transaction) => {
  try {
    const region = await Region.findByPk(id, { transaction });
    if (!region) throw new Error("ክልል አልተገኘም።");
    await region.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ክልል መሰረዝ አልተሳካም።");
  }
};