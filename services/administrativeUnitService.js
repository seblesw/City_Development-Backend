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

const updateAdministrativeUnitService = async (id, unitData, updatedByUserId, transaction = null) => {
  try {
 

    // 1. Get the existing unit
    const unit = await AdministrativeUnit.findByPk(id, { 
      where: { deleted_at: null },
      transaction 
    });
    
    if (!unit) {
      throw new Error("Administrative unit not found");
    }


    // 2. Prepare update data - use existing values if not provided
    const updateData = {
      name: unitData.name !== undefined ? unitData.name : unit.name,
      region_id: unitData.region_id !== undefined ? unitData.region_id : unit.region_id,
      zone_id: unitData.zone_id !== undefined ? unitData.zone_id : unit.zone_id,
      woreda_id: unitData.woreda_id !== undefined ? unitData.woreda_id : unit.woreda_id,
      oversight_office_id: unitData.oversight_office_id !== undefined 
        ? unitData.oversight_office_id 
        : unit.oversight_office_id,
      type: unitData.type !== undefined ? unitData.type : unit.type,
      updated_by: updatedByUserId || null,
    };


    // 3. Validate type if provided
    if (updateData.type && !typeLevels[updateData.type]) {
      throw new Error("Invalid unit type");
    }

    // 4. Check for duplicate name only if name is being updated
    if (unitData.name !== undefined) {
      const existingUnit = await AdministrativeUnit.findOne({
        where: {
          name: updateData.name,
          region_id: updateData.region_id,
          oversight_office_id: updateData.oversight_office_id || null,
          id: { [Op.ne]: id },
          deleted_at: null,
        },
        transaction
      });
      
      if (existingUnit) {
        throw new Error("Unit name already exists in this region and office");
      }
    }

    // 5. Validate region
    const region = await Region.findByPk(updateData.region_id, { transaction });
    if (!region) {
      throw new Error("Invalid region selected");
    }

    // 6. Validate zone if provided
    if (updateData.zone_id !== null && updateData.zone_id !== undefined) {
      const zone = await Zone.findByPk(updateData.zone_id, { transaction });
      if (!zone) {
        throw new Error("Invalid zone selected");
      }
      if (zone.region_id !== updateData.region_id) {
        throw new Error("Zone must belong to the selected region");
      }
    }

    // 7. Validate woreda if provided
    if (updateData.woreda_id !== null && updateData.woreda_id !== undefined) {
      const woreda = await Woreda.findByPk(updateData.woreda_id, { transaction });
      if (!woreda) {
        throw new Error("Invalid woreda selected");
      }
      if (woreda.zone_id !== updateData.zone_id) {

        throw new Error("Woreda must belong to the selected zone");
      }
    }

    // 8. Validate oversight office if provided
    if (updateData.oversight_office_id !== null && updateData.oversight_office_id !== undefined) {
      const oversightOffice = await OversightOffice.findByPk(updateData.oversight_office_id, { transaction });
      if (!oversightOffice) {
        throw new Error("Oversight office not found");
      }
      if (oversightOffice.region_id !== updateData.region_id) {
        throw new Error("Oversight office must be in the same region");
      }
    }

    // 9. Update code if location changed
    const locationChanged = (
      unitData.region_id !== undefined ||
      unitData.zone_id !== undefined ||
      unitData.woreda_id !== undefined
    );

    if (locationChanged) {
      const zoneCode = updateData.zone_id 
        ? (await Zone.findByPk(updateData.zone_id, { transaction }))?.code?.split("-")[1] || "NZ" 
        : "NZ";
      
      const woredaCode = updateData.woreda_id 
        ? (await Woreda.findByPk(updateData.woreda_id, { transaction }))?.code?.split("-")[2] || "NW" 
        : "NW";
      
      const count = await AdministrativeUnit.count({ transaction });
      updateData.code = `${region.code}-${zoneCode}-${woredaCode}-AU${count + 1}`;
    }

    // 10. Update level mappings if type changed
    if (unitData.type !== undefined) {
      updateData.unit_level = typeLevels[updateData.type];
      updateData.max_land_levels = levelMap[typeLevels[updateData.type]];

    }

    // 11. Perform the update
    await unit.update(updateData, { transaction });

    // 12. Return the updated unit with associations
    const updatedUnit = await AdministrativeUnit.findByPk(id, {
      include: [
        { model: Region, as: "region" },
        { model: Zone, as: "zone" },
        { model: Woreda, as: "woreda" },
        { model: OversightOffice, as: "oversightOffice" },
        { model: User, as: "users", attributes: ["id", "first_name", "last_name"] },
        { model: LandRecord, as: "landRecords" },
      ],
      transaction
    });

    return updatedUnit;

  } catch (error) {
    throw new Error(error.message || "Failed to update administrative unit");
  }
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