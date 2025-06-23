const { Op } = require("sequelize");
const { Zone, Region, Woreda } = require("../models");

exports.createZoneService = async (data, userId, transaction) => {
  const { name, region_id } = data;
  try {
    const existingZone = await Zone.findOne({
      where: { name, region_id, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (existingZone) throw new Error("ይህ ስም ያለው ዞን ተመዝግቧል።");
    const region = await Region.findByPk(region_id, { transaction });
    if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
    return await Zone.create({ name, region_id, created_by: userId }, { transaction });
  } catch (error) {
    throw new Error(error.message || "ዞን መፍጠር አልተሳካም።");
  }
};

exports.getAllZonesService = async (regionId) => {
  try {
    const where = regionId ? { region_id: regionId, deleted_at: { [Op.eq]: null } } : { deleted_at: { [Op.eq]: null } };
    return await Zone.findAll({
      where,
      include: [{ model: Woreda, as: "woredas", where: { deleted_at: { [Op.eq]: null } }, required: false }],
    });
  } catch (error) {
    throw new Error(error.message || "ዞኖችን ማግኘት አልተሳካም።");
  }
};

exports.getZoneByIdService = async (id) => {
  try {
    const zone = await Zone.findByPk(id, {
      include: [{ model: Woreda, as: "woredas", where: { deleted_at: { [Op.eq]: null } }, required: false }],
    });
    if (!zone) throw new Error("ዞን አልተገኘም።");
    return zone;
  } catch (error) {
    throw new Error(error.message || "ዞን ማግኘት አልተሳካም።");
  }
};

exports.updateZoneService = async (id, data, userId, transaction) => {
  const { name, region_id } = data;
  try {
    const zone = await Zone.findByPk(id, { transaction });
    if (!zone) throw new Error("ዞን አልተገኘም።");
    if (name && name !== zone.name) {
      const existingZone = await Zone.findOne({
        where: { name, region_id: region_id || zone.region_id, deleted_at: { [Op.eq]: null } },
        transaction,
      });
      if (existingZone) throw new Error("ይህ ስም ያለው ዞን ተመዝግቧል።");
    }
    if (region_id) {
      const region = await Region.findByPk(region_id, { transaction });
      if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }
    await zone.update({ name, region_id, updated_by: userId }, { transaction });
    return zone;
  } catch (error) {
    throw new Error(error.message || "ዞን ማዘመን አልተሳካም።");
  }
};

exports.deleteZoneService = async (id, userId, transaction) => {
  try {
    const zone = await Zone.findByPk(id, { transaction });
    if (!zone) throw new Error("ዞን አልተገኘም።");
    await zone.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ዞን መሰረዝ አልተሳካም።");
  }
};