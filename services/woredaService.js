const { Op } = require("sequelize");
const { Woreda, Zone } = require("../models");

exports.createWoredaService = async (data, userId, transaction) => {
  const { name, zone_id } = data;
  try {
    const existingWoreda = await Woreda.findOne({
      where: { name, zone_id, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (existingWoreda) throw new Error("ይህ ስም ያለው ወረዳ ተመዝግቧል።");
    const zone = await Zone.findByPk(zone_id, { transaction });
    if (!zone) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    return await Woreda.create({ name, zone_id, created_by: userId }, { transaction });
  } catch (error) {
    throw new Error(error.message || "ወረዳ መፍጠር አልተሳካም።");
  }
};

exports.getAllWoredasService = async (zoneId) => {
  try {
    const where = zoneId ? { zone_id: zoneId, deleted_at: { [Op.eq]: null } } : { deleted_at: { [Op.eq]: null } };
    return await Woreda.findAll({ where });
  } catch (error) {
    throw new Error(error.message || "ወረዳዎችን ማግኘት አልተሳካም።");
  }
};

exports.getWoredaByIdService = async (id) => {
  try {
    const woreda = await Woreda.findByPk(id);
    if (!woreda) throw new Error("ወረዳ አልተገኘም።");
    return woreda;
  } catch (error) {
    throw new Error(error.message || "ወረዳ ማግኘት አልተሳካም።");
  }
};

exports.updateWoredaService = async (id, data, userId, transaction) => {
  const { name, zone_id } = data;
  try {
    const woreda = await Woreda.findByPk(id, { transaction });
    if (!woreda) throw new Error("ወረዳ አልተገኘም።");
    if (name && name !== woreda.name) {
      const existingWoreda = await Woreda.findOne({
        where: { name, zone_id: zone_id || woreda.zone_id, deleted_at: { [Op.eq]: null } },
        transaction,
      });
      if (existingWoreda) throw new Error("ይህ ስም ያለው ወረዳ ተመዝግቧል።");
    }
    if (zone_id) {
      const zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    await woreda.update({ name, zone_id, updated_by: userId }, { transaction });
    return woreda;
  } catch (error) {
    throw new Error(error.message || "ወረዳ ማዘመን አልተሳካም።");
  }
};

exports.deleteWoredaService = async (id, userId, transaction) => {
  try {
    const woreda = await Woreda.findByPk(id, { transaction });
    if (!woreda) throw new Error("ወረዳ አልተገኘም።");
    await woreda.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ወረዳ መሰረዝ አልተሳካም።");
  }
};