const { Op } = require("sequelize");
const { Region, Zone, AdministrativeUnit, OversightOffice } = require("../models/index");

const createRegionService = async (regionData) => {
  const { name } = regionData;

  // Generate code: first 3 letters of name in uppercase + random suffix
  const code = `${name.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(-4)}`;

  const existingRegion = await Region.findOne({
    where: { [Op.or]: [{ name }, { code }], deleted_at: null },
  });
  if (existingRegion) {
    throw new Error("የክልል ስም ወይም ኮድ ተይዟል።");
  }

  const region = await Region.create({
    name,
    code,
  });

  return Region.findByPk(region.id, {
    include: [
      { model: Zone, as: "zones" },
    ],
  });
};

const getAllRegionsService = async () => {
  return Region.findAll({
    where: { deleted_at: null },
    include: [
      { model: Zone, as: "zones" },
   
    ],
    order: [["createdAt", "DESC"]],
  });
};

const getRegionByIdService = async (id) => {
  const region = await Region.findByPk(id, {
    where: { deleted_at: null },
    include: [
      { model: Zone, as: "zones" },
 
    ],
  });

  if (!region) {
    throw new Error("ክልል አልተገኘም።");
  }

  return region;
};

const updateRegionService = async (id, regionData, updatedByUserId) => {
  const region = await Region.findByPk(id, { where: { deleted_at: null } });
  if (!region) {
    throw new Error("ክልል አልተገኘም።");
  }

  const { name } = regionData;
  let { code } = regionData;

  if (name && !code) {
    code = `${name.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(-4)}`;
  }

  if (name || code) {
    const existingRegion = await Region.findOne({
      where: { [Op.or]: [{ name }, { code }], id: { [Op.ne]: id }, deleted_at: null },
    });
    if (existingRegion) {
      throw new Error("የክልል ስም ወይም ኮድ ተይዟል።");
    }
  }

  await region.update({
    name,
    code,
    updated_by: updatedByUserId,
  });

  return Region.findByPk(id, {
    include: [
      { model: Zone, as: "zones" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
      { model: OversightOffice, as: "oversightOffices" },
    ],
  });
};

const deleteRegionService = async (id, deletedByUserId) => {
  const region = await Region.findByPk(id, { where: { deleted_at: null } });
  if (!region) {
    throw new Error("ክልል አልተገኘም።");
  }

  await region.update({ deleted_at: new Date(), deleted_by: deletedByUserId });
};

module.exports = {
  createRegionService,
  getAllRegionsService,
  getRegionByIdService,
  updateRegionService,
  deleteRegionService,
};