const { Op } = require("sequelize");
const { AdministrativeUnit, Region, Zone, Woreda, OversightOffice, User, LandRecord } = require("../models/index");

const typeLevels = {
  "ሪጂኦፖሊታን": 1,
  "መካከለኛ ከተማ": 2,
  "አነስተኛ ከተማ": 3,
  "መሪ ማዘጋጃ ከተማ": 4,
  "ንዑስ ማዘጋጃ ከተማ": 5,
  "ታዳጊ ከተማ": 6,
};

const levelMap = {
  1: 5,
  2: 5,
  3: 5,
  4: 4,
  5: 3,
  6: 2,
};

const createAdministrativeUnitService = async (unitData, createdByUserId) => {
  const { name, region_id, zone_id, woreda_id, oversight_office_id, type } = unitData;

  if (!typeLevels[type]) {
    throw new Error("ትክክለኛ የክፍል አይነት ይምረጡ።");
  }

  const existingUnit = await AdministrativeUnit.findOne({
    where: { name, region_id, oversight_office_id: oversight_office_id || null, deleted_at: null },
  });
  if (existingUnit) {
    throw new Error("የአስተዳደር ክፍል ስም በዚህ ክልል እና ቢሮ ውስጥ ተይዟል።");
  }

  const region = await Region.findByPk(region_id);
  if (!region) {
    throw new Error("ትክክለኛ ክልል ይምረጡ።");
  }

  const zone = zone_id ? await Zone.findByPk(zone_id) : null;
  if (zone_id && !zone) {
    throw new Error("ትክክለኛ ዞን ይምረጡ።");
  }

  const woreda = woreda_id ? await Woreda.findByPk(woreda_id) : null;
  if (woreda_id && !woreda) {
    throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
  }

  const oversight = oversight_office_id ? await OversightOffice.findByPk(oversight_office_id) : null;
  if (oversight_office_id && (!oversight || oversight.region_id !== region.id)) {
    throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
  }

  const count = await AdministrativeUnit.count();
  const code = `${region.code}-${zone?.code.split("-")[1] || "NZ"}-${woreda?.code.split("-")[2] || "NW"}-AU${count + 1}`;
  const unit_level = typeLevels[type];
  const max_land_levels = levelMap[unit_level];

  const unit = await AdministrativeUnit.create({
    name,
    region_id,
    zone_id,
    woreda_id,
    oversight_office_id,
    type,
    unit_level,
    max_land_levels,
    code,
    created_by: createdByUserId || null,
  });

  return AdministrativeUnit.findByPk(unit.id, {
    include: [
      { model: Region, as: "region" },
      { model: Zone, as: "zone" },
      { model: Woreda, as: "woreda" },
      { model: OversightOffice, as: "oversightOffice" },
      { model: User, as: "users", attributes: ["id", "first_name", "last_name"] },
      { model: LandRecord, as: "landRecords" },
    ],
  });
};

const getAllAdministrativeUnitsService = async () => {
  return AdministrativeUnit.findAll({
    where: { deleted_at: null },
    include: [
      { model: Region, as: "region" },
      { model: Zone, as: "zone" },
      { model: Woreda, as: "woreda" },
      { model: OversightOffice, as: "oversightOffice" },
      { model: User, as: "users", attributes: ["id", "first_name", "last_name"] },
      { model: LandRecord, as: "landRecords" },
    ],
    order: [["createdAt", "DESC"]],
  });
};

const getAdministrativeUnitByIdService = async (id) => {
  const unit = await AdministrativeUnit.findByPk(id, {
    where: { deleted_at: null },
    include: [
      { model: Region, as: "region" },
      { model: Zone, as: "zone" },
      { model: Woreda, as: "woreda" },
      { model: OversightOffice, as: "oversightOffice" },
      { model: User, as: "users", attributes: ["id", "first_name", "last_name"] },
      { model: LandRecord, as: "landRecords" },
    ],
  });

  if (!unit) {
    throw new Error("አስተዳደር ክፍል አልተገኘም።");
  }

  return unit;
};

const updateAdministrativeUnitService = async (id, unitData, updatedByUserId) => {
  const unit = await AdministrativeUnit.findByPk(id, { where: { deleted_at: null } });
  if (!unit) {
    throw new Error("አስተዳደር ክፍል አልተገኘም።");
  }

  const { name, region_id, zone_id, woreda_id, oversight_office_id, type } = unitData;

  if (type && !typeLevels[type]) {
    throw new Error("ትክክለኛ የክፍል አይነት ይምረጡ።");
  }

  if (name || region_id || oversight_office_id) {
    const existingUnit = await AdministrativeUnit.findOne({
      where: {
        name,
        region_id: region_id || unit.region_id,
        oversight_office_id: oversight_office_id || unit.oversight_office_id || null,
        id: { [Op.ne]: id },
        deleted_at: null,
      },
    });
    if (existingUnit) {
      throw new Error("የአስተዳደር ክፍል ስም በዚህ ክልል እና ቢሮ ውስጥ ተይዟል።");
    }
  }

  const region = region_id ? await Region.findByPk(region_id) : await Region.findByPk(unit.region_id);
  if (!region) {
    throw new Error("ትክክለኛ ክልል ይምረጡ።");
  }

  const zone = zone_id ? await Zone.findByPk(zone_id) : zone_id === null ? null : await Zone.findByPk(unit.zone_id);
  if (zone_id && !zone) {
    throw new Error("ትክክለኛ ዞን ይምረጡ።");
  }

  const woreda = woreda_id ? await Woreda.findByPk(woreda_id) : woreda_id === null ? null : await Woreda.findByPk(unit.woreda_id);
  if (woreda_id && !woreda) {
    throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
  }

  const oversight = oversight_office_id ? await OversightOffice.findByPk(oversight_office_id) : oversight_office_id === null ? null : await OversightOffice.findByPk(unit.oversight_office_id);
  if (oversight_office_id && (!oversight || oversight.region_id !== (region.id || unit.region_id))) {
    throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
  }

  let code = unit.code;
  if (region_id || zone_id || woreda_id) {
    const count = await AdministrativeUnit.count();
    code = `${region.code}-${zone?.code.split("-")[1] || "NZ"}-${woreda?.code.split("-")[2] || "NW"}-AU${count + 1}`;
  }

  const unit_level = type ? typeLevels[type] : unit.unit_level;
  const max_land_levels = levelMap[unit_level];

  await unit.update({
    name,
    region_id,
    zone_id,
    woreda_id,
    oversight_office_id,
    type,
    unit_level,
    max_land_levels,
    code,
    updated_by: updatedByUserId || null,
  });

  return AdministrativeUnit.findByPk(id, {
    include: [
      { model: Region, as: "region" },
      { model: Zone, as: "zone" },
      { model: Woreda, as: "woreda" },
      { model: OversightOffice, as: "oversightOffice" },
      { model: User, as: "users", attributes: ["id", "first_name", "last_name"] },
      { model: LandRecord, as: "landRecords" },
    ],
  });
};

const deleteAdministrativeUnitService = async (id, deletedByUserId) => {
  const unit = await AdministrativeUnit.findByPk(id, { where: { deleted_at: null } });
  if (!unit) {
    throw new Error("አስተዳደር ክፍል አልተገኘም።");
  }

  await unit.update({ deleted_at: new Date(), deleted_by: deletedByUserId || null });
};

module.exports = {
  createAdministrativeUnitService,
  getAllAdministrativeUnitsService,
  getAdministrativeUnitByIdService,
  updateAdministrativeUnitService,
  deleteAdministrativeUnitService,
};