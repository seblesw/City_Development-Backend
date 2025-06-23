const { Op } = require("sequelize");
const { AdministrativeUnit, Region, Zone, Woreda, OversightOffice } = require("../models");

exports.createAdministrativeUnitService = async (data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations } = data;
  try {
    const existingUnit = await AdministrativeUnit.findOne({
      where: { name, region_id, oversight_office_id, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (existingUnit) throw new Error("ይህ ስም ያለው አስተዳደራዊ ክፍል ተመዝግቧል።");
    const region = await Region.findByPk(region_id, { transaction });
    if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
    if (zone_id) {
      const zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== region_id) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    if (woreda_id) {
      const woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== zone_id) throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
    }
    if (oversight_office_id) {
      const office = await OversightOffice.findByPk(oversight_office_id, { transaction });
      if (!office || office.region_id !== region_id) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
    }
    return await AdministrativeUnit.create(
      { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations, created_by: userId },
      { transaction }
    );
  } catch (error) {
    throw new Error(error.message || "አስተዳደራዊ ክፍል መፍጠር አልተሳካም።");
  }
};

exports.getAllAdministrativeUnitsService = async (regionId, oversightOfficeId) => {
  try {
    const where = { deleted_at: { [Op.eq]: null } };
    if (regionId) where.region_id = regionId;
    if (oversightOfficeId) where.oversight_office_id = oversightOfficeId;
    return await AdministrativeUnit.findAll({ where });
  } catch (error) {
    throw new Error(error.message || "አስተዳደራዊ ክፍሎችን ማግኘቤት አልተሳካም።");
  }
};

exports.getAdministrativeUnitByIdService = async (id) => {
  try {
    const unit = await AdministrativeUnit.findByPk(id);
    if (!unit) {
      throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
    }
    return unit;
  } catch (error) {
    throw new Error(error.message || "አስተዳደራዊ ክፍል ማግኘቤት አልተሳካም።");
  }
};

exports.updateAdministrativeUnitService = async (id, data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations } = data;
  try {
    const unit = await AdministrativeUnit.findByPk(id, { transaction });
    if (!unit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
    if (name && name !== unit.name) {
      const existingUnit = await AdministrativeUnit.findOne({
        where: {
          name,
          region_id: region_id || unit.region_id,
          oversight_office_id: oversight_office_id || unit.oversight_office_id,
          deleted_at: { [Op.eq]: null },
        },
        transaction,
      });
      if (existingUnit) throw new Error("ይህ ስም ያለው አስተዳደራዊ ክፍል ተመዝግቧል።");
    }
    if (region_id) {
      const region = await Region.findByPk(region_id, { transaction });
      if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }
    if (zone_id) {
      const zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== (region_id || unit.region_id)) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    if (woreda_id) {
      const woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== (zone_id || unit.zone_id)) throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
    }
    if (oversight_office_id) {
      const office = await OversightOffice.findByPk(oversight_office_id, { transaction });
      if (!office || office.region_id !== (region_id || unit.region_id)) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
    }
    await unit.update(
      { name, region_id, zone_id, woreda_id, oversight_office_id, type, name_translations, updated_by: userId },
      { transaction }
    );
    return unit;
  } catch (error) {
    throw new Error(error.message || "አስተዳደራዊ ክፍል ማዘመን አልተሳካም።");
  }
};

exports.deleteAdministrativeUnitService = async (id, userId, transaction) => {
  try {
    const unit = await AdministrativeUnit.findByPk(id, { transaction });
    if (!unit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
    await unit.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "አስተዳደራዊ ክፍል መሰረዝ አልተሳካም።");
  }
};