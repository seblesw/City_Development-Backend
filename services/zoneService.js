const { Op } = require("sequelize");
const { Zone, Region, Woreda, AdministrativeUnit } = require("../models/index");

const createZoneService = async (zoneData, createdByUserId) => {
  const { name, region_id } = zoneData;

  const existingZone = await Zone.findOne({
    where: { name, region_id, deletedAt: null },
  });
  if (existingZone) {
    throw new Error("የዞን ስም በዚህ ክልል ውስጥ ተይዟል።");
  }

  const region = await Region.findByPk(region_id);
  if (!region) {
    throw new Error("ትክክለኛ ክልል ይምረጡ።");
  }

  const count = await Zone.count({ where: { region_id } });
  const code = `${region.code}-Z${count + 1}`;

  const zone = await Zone.create({
    name,
    region_id,
    code,
    created_by: createdByUserId || null,
  });

  return Zone.findByPk(zone.id, {
    include: [
      { model: Region, as: "region" },
      { model: Woreda, as: "woredas" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });
};

const getAllZonesService = async () => {
  return Zone.findAll({
    where: { deletedAt: null },
    include: [
      { model: Region, as: "region" },
      { model: Woreda, as: "woredas" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
    order: [["createdAt", "DESC"]],
  });
};

const getZoneByIdService = async (id) => {
  const zone = await Zone.findByPk(id, {
    where: { deletedAt: null },
    include: [
      { model: Region, as: "region" },
      { model: Woreda, as: "woredas" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });

  if (!zone) {
    throw new Error("ዞን አልተገኘም።");
  }

  return zone;
};

const updateZoneService = async (id, zoneData, updatedByUserId) => {
  const zone = await Zone.findByPk(id, { where: { deletedAt: null } });
  if (!zone) {
    throw new Error("ዞን አልተገኘም።");
  }

  const { name, region_id } = zoneData;

  if (name || region_id) {
    const existingZone = await Zone.findOne({
      where: {
        name,
        region_id: region_id || zone.region_id,
        id: { [Op.ne]: id },
        deletedAt: null,
      },
    });
    if (existingZone) {
      throw new Error("የዞን ስም በዚህ ክልል ውስጥ ተዯይዟል።");
    }
  }

  let code = zone.code;
  if (region_id && region_id !== zone.region_id) {
    const region = await Region.findByPk(region_id);
    if (!region) {
      throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }
    const count = await Zone.count({ where: { region_id } });
    code = `${region.code}-Z${count + 1}`;
  }

  await zone.update({
    name,
    region_id,
    code,
    updated_by: updatedByUserId || null,
  });

  return Zone.findByPk(id, {
    include: [
      { model: Region, as: "region" },
      { model: Woreda, as: "woredas" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });
};
const deleteZoneService = async (id, deletedByUserId) => {
  const zone = await Zone.findByPk(id, { where: { deletedAt: null } });
  if (!zone) {
    throw new Error("ዞን አልተገኘም።");
  }

  
  await zone.destroy({ force: true });

  return { message: "ዞን ተሰርዟል።", id };
};

module.exports = {
  createZoneService,
  getAllZonesService,
  getZoneByIdService,
  updateZoneService,
  deleteZoneService,
};