const { Op } = require("sequelize");
const { OversightOffice, Region, Zone, Woreda, AdministrativeUnit } = require("../models");
exports.createOversightOfficeService = async (data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id } = data;
  try {
    // Check for existing office with same name in the region
    const existingOffice = await OversightOffice.findOne({
      where: { name, region_id, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (existingOffice) throw new Error("ይህ ስም ያለው ቢሮ ተመዝግቧል።");

    // Validate region
    const region = await Region.findByPk(region_id, { transaction });
    if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");

    // Validate zone if provided
    let zone = null;
    if (zone_id) {
      zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== region_id) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }

    // Validate woreda if provided
    let woreda = null;
    if (woreda_id) {
      woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== zone_id) throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
    }

    // Generate code based on region, zone, woreda
    // Find count of offices in this region/zone/woreda
    const where = { region_id, deleted_at: { [Op.eq]: null } };
    if (zone_id) where.zone_id = zone_id;
    if (woreda_id) where.woreda_id = woreda_id;
    const count = await OversightOffice.count({ where, transaction });

    const regionCode = region.code;
    const zoneCode = zone ? (zone.code.split("-")[1] || "NZ") : "NZ";
    const woredaCode = woreda ? (woreda.code.split("-")[2] || "NW") : "NW";
    const code = `${regionCode}-${zoneCode}-${woredaCode}-OF${count + 1}`;

    return await OversightOffice.create(
      { name, region_id, zone_id, woreda_id, code, created_by: userId },
      { transaction }
    );
  } catch (error) {
    throw new Error(error.message || "ቢሮ መፍጠር አልተሳካም።");
  }
};

exports.getAllOversightOfficesService = async (regionId) => {
  try {
    const where = regionId ? { region_id: regionId, deleted_at: { [Op.eq]: null } } : { deleted_at: { [Op.eq]: null } };
    return await OversightOffice.findAll({
      where,
      include: [{ model: AdministrativeUnit, as: "administrativeUnits", where: { deleted_at: { [Op.eq]: null } }, required: false }],
    });
  } catch (error) {
    throw new Error(error.message || "ቢሮዎችን ማግኘት አልተሳካም።");
  }
};

exports.getOversightOfficeByIdService = async (id) => {
  try {
    const office = await OversightOffice.findByPk(id, {
      include: [{ model: AdministrativeUnit, as: "administrativeUnits", where: { deleted_at: { [Op.eq]: null } }, required: false }],
    });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    return office;
  } catch (error) {
    throw new Error(error.message || "ቢሮ ማግኘት አልተሳካም።");
  }
};

exports.updateOversightOfficeService = async (id, data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id } = data;
  try {
    const office = await OversightOffice.findByPk(id, { transaction });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    if (name && name !== office.name) {
      const existingOffice = await OversightOffice.findOne({
        where: { name, region_id: region_id || office.region_id, deleted_at: { [Op.eq]: null } },
        transaction,
      });
      if (existingOffice) throw new Error("ይህ ስም ያለው ቢሮ ተመዝግቧል።");
    }
    if (region_id) {
      const region = await Region.findByPk(region_id, { transaction });
      if (!region) throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }
    if (zone_id) {
      const zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== (region_id || office.region_id)) throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    if (woreda_id) {
      const woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== (zone_id || office.zone_id)) throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
    }
    await office.update({ name, region_id, zone_id, woreda_id, updated_by: userId }, { transaction });
    return office;
  } catch (error) {
    throw new Error(error.message || "ቢሮ ማዘመን አልተሳካም።");
  }
};

exports.deleteOversightOfficeService = async (id, userId, transaction) => {
  try {
    const office = await OversightOffice.findByPk(id, { transaction });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    await office.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ቢሮ መሰረዝ አልተሳካም።");
  }
};