const { Op } = require("sequelize");
const {
  OversightOffice,
  Region,
  Zone,
  Woreda,
  AdministrativeUnit,
  OWNERSHIP_TYPES,
  LAND_USES,
  ZONING_TYPES,
  LandOwner,
  LandRecord,
  sequelize,
  User,
  LAND_USE_TYPES,
} = require("../models");
const createOversightOfficeService = async (data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id } = data;

  try {
    // Check for existing office with same name in the region (including soft-deleted)
    const existingOffice = await OversightOffice.findOne({
      where: {
        name,
        region_id,
      },
      transaction,
    });

    if (existingOffice && !existingOffice.deletedAt) {
      throw new Error("ይህ ስም ያለው ቢሮ ተመዝግቧል።");
    }

    // Validate region
    const region = await Region.findByPk(region_id, { transaction });
    if (!region) {
      throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }

    // Validate zone if provided
    let zone = null;
    if (zone_id) {
      zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== region.id) {
        throw new Error("ትክክለኛ ዞን ይምረጡ።");
      }
    }

    // Validate woreda if provided
    let woreda = null;
    if (woreda_id) {
      if (!zone_id) {
        throw new Error("ወረዳ ለመመዝገብ በመጀመሪያ ዞን መመዝገብ አለበት።");
      }

      woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== zone.id) {
        throw new Error("ትክለኛ ወረዳ ይምረጡ።");
      }
    }

    // Generate a unique code with retry logic
    let code;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // Find count of active offices in this region/zone/woreda
      const where = {
        region_id,
        deletedAt: { [Op.eq]: null },
      };

      if (zone_id) where.zone_id = zone_id;
      if (woreda_id) where.woreda_id = woreda_id;

      const count = await OversightOffice.count({
        where,
        transaction,
      });

      const regionCode = region.code;
      const zoneCode = zone ? zone.code.split("-")[1] || "NZ" : "NZ";
      const woredaCode = woreda ? woreda.code.split("-")[2] || "NW" : "NW";
      code = `${regionCode}-${zoneCode}-${woredaCode}-OF${count + 1}`;

      // Check if code already exists
      const codeExists = await OversightOffice.findOne({
        where: { code },
        transaction,
      });

      if (!codeExists) {
        break; 
      }

      if (attempts === maxAttempts) {
        throw new Error("ለመፍጠር የሚሞከርበት ጊዜ አልቋል። እባክዎ እንደገና ይሞክሩ።");
      }
    }

    // Create the oversight office
    return await OversightOffice.create(
      {
        name,
        region_id,
        zone_id: zone_id || null,
        woreda_id: woreda_id || null,
        code,
        created_by: userId,
      },
      { transaction }
    );
  } catch (error) {
    console.error(error);
    throw new Error(error.message || "ቢሮ መፍጠር አልተሳካም።");
  }
};

const getAllOversightOfficesService = async (regionId) => {
  try {
    const where = regionId
      ? { region_id: regionId, deletedAt: { [Op.eq]: null } }
      : { deletedAt: { [Op.eq]: null } };
    return await OversightOffice.findAll({
      where,
      include: [
        {
          model: AdministrativeUnit,
          as: "administrativeUnits",
          where: { deletedAt: { [Op.eq]: null } },
          required: false,
        },
      ],
    });
  } catch (error) {
    throw new Error(error.message || "ቢሮዎችን ማግኘት አልተሳካም።");
  }
};

const getOversightOfficeByIdService = async (id) => {
  try {
    const office = await OversightOffice.findByPk(id, {
      include: [
        {
          model: AdministrativeUnit,
          as: "administrativeUnits",
          where: { deletedAt: { [Op.eq]: null } },
          required: false,
        },
      ],
    });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    return office;
  } catch (error) {
    throw new Error(error.message || "ቢሮ ማግኘት አልተሳካም።");
  }
};

const updateOversightOfficeService = async (
  id,
  data,
  userId,
  transaction
) => {
  const { name, region_id, zone_id, woreda_id } = data;
  try {
    const office = await OversightOffice.findByPk(id, { transaction });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    if (name && name !== office.name) {
      const existingOffice = await OversightOffice.findOne({
        where: {
          name,
          region_id: region_id || office.region_id,
          deletedAt: { [Op.eq]: null },
        },
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
      if (!zone || zone.region_id !== (region_id || office.region_id))
        throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    if (woreda_id) {
      const woreda = await Woreda.findByPk(woreda_id, { transaction });
      if (!woreda || woreda.zone_id !== (zone_id || office.zone_id))
        throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
    }
    await office.update(
      { name, region_id, zone_id, woreda_id, updated_by: userId },
      { transaction }
    );
    return office;
  } catch (error) {
    throw new Error(error.message || "ቢሮ ማዘመን አልተሳካም።");
  }
};

const deleteOversightOfficeService = async (id, transaction) => {
  try {
    const office = await OversightOffice.findByPk(id, { transaction });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    await office.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ቢሮ መሰረዝ አልተሳካም።");
  }
};


const getOversightOfficeStatsService = async (oversightOfficeId) => {
  try {
    // 1. Get the oversight office and its hierarchy
    const oversightOffice = await OversightOffice.findByPk(oversightOfficeId, {
      include: [
        { model: Region, as: "region", attributes: ["id", "name", "code"] },
        { model: Zone, as: "zone", attributes: ["id", "name", "code"] },
        { model: Woreda, as: "woreda", attributes: ["id", "name", "code"] },
      ],
    });

    if (!oversightOffice) {
      throw new Error("ቢሮ አልተገኘም።");
    }

    // 2. Determine hierarchy level and build query
    const where = { deletedAt: null };
    if (oversightOffice.woreda_id) {
      where.woreda_id = oversightOffice.woreda_id;
      where.zone_id = oversightOffice.zone_id;
    } else if (oversightOffice.zone_id) {
      where.zone_id = oversightOffice.zone_id;
    }
    where.region_id = oversightOffice.region_id;

    // 3. Get all oversight offices in this hierarchy with their admin units
    const offices = await OversightOffice.findAll({
      where,
      include: [{
        model: AdministrativeUnit,
        as: "administrativeUnits",
        where: { deletedAt: null },
        required: false,
      }],
    });

    // 4. Get all admin unit IDs
    const adminUnitIds = offices.flatMap(o => 
      o.administrativeUnits.map(u => u.id)
    );

    if (adminUnitIds.length === 0) {
      return {
        status: "success",
        data: {
          oversightOffice: {
            id: oversightOffice.id,
            name: oversightOffice.name,
            level: oversightOffice.woreda_id ? "woreda" : 
                  oversightOffice.zone_id ? "zonal" : "regional",
            region: oversightOffice.region,
            zone: oversightOffice.zone,
            woreda: oversightOffice.woreda
          },
          totalOffices: offices.length,
          totalAdministrativeUnits: 0,
          totalLandRecords: 0,
          totalLandowners: 0,
          administrativeUnits: [],
        }
      };
    }

    // 5. Get all land records for these admin units with their owners
    const landRecords = await LandRecord.findAll({
      where: {
        administrative_unit_id: { [Op.in]: adminUnitIds },
        deletedAt: null
      },
      include: [{
        model: User,
        as: "owners",
        through: { 
          attributes: [] 
        },
        required: false
      }],
    });

    // 6. Initialize statsByAdminUnit with all possible enum values
    const statsByAdminUnit = {};
    
    // Get all enum values as arrays
    const ownershipTypeValues = Object.values(OWNERSHIP_TYPES);
    const landUseValues = Object.values(LAND_USE_TYPES);
    const zoningTypeValues = Object.values(ZONING_TYPES);

    // Initialize each admin unit with all enum values set to 0
    adminUnitIds.forEach(adminUnitId => {
      statsByAdminUnit[adminUnitId] = {
        landRecordCount: 0,
        landownerIds: new Set(),
        ownershipTypes: {},
        landUses: {},
        zoningTypes: {}
      };

      ownershipTypeValues.forEach(type => {
        statsByAdminUnit[adminUnitId].ownershipTypes[type] = 0;
      });

      landUseValues.forEach(type => {
        statsByAdminUnit[adminUnitId].landUses[type] = 0;
      });

      zoningTypeValues.forEach(type => {
        statsByAdminUnit[adminUnitId].zoningTypes[type] = 0;
      });
    });

    // 7. Process the land records to populate the counts
    landRecords.forEach(record => {
      const adminUnitId = record.administrative_unit_id;
      
      statsByAdminUnit[adminUnitId].landRecordCount++;
      
      // Count by ownership type
      if (record.ownership_type && ownershipTypeValues.includes(record.ownership_type)) {
        statsByAdminUnit[adminUnitId].ownershipTypes[record.ownership_type]++;
      }
      
      // Count by land use
      if (record.land_use && landUseValues.includes(record.land_use)) {
        statsByAdminUnit[adminUnitId].landUses[record.land_use]++;
      }
      
      // Count by zoning type
      if (record.zoning_type && zoningTypeValues.includes(record.zoning_type)) {
        statsByAdminUnit[adminUnitId].zoningTypes[record.zoning_type]++;
      }
      
      // Process owners - ensure we have valid owner data
      if (record.owners && Array.isArray(record.owners)) {
        record.owners.forEach(owner => {
          if (owner && owner.id) {
            statsByAdminUnit[adminUnitId].landownerIds.add(owner.id);
          }
        });
      }
    });

    // 8. Get admin unit details
    const adminUnits = await AdministrativeUnit.findAll({
      where: { id: { [Op.in]: adminUnitIds } },
      attributes: ["id", "name"]
    });

    // 9. Prepare the final stats
    const stats = {
      status: "success",
      data: {
        oversightOffice: {
          id: oversightOffice.id,
          name: oversightOffice.name,
          level: oversightOffice.woreda_id ? "woreda" : 
                oversightOffice.zone_id ? "zonal" : "regional",
          region: oversightOffice.region,
          zone: oversightOffice.zone,
          woreda: oversightOffice.woreda
        },
        totalOffices: offices.length,
        totalAdministrativeUnits: adminUnitIds.length,
        totalLandRecords: landRecords.length,
        totalLandowners: Object.values(statsByAdminUnit).reduce(
          (sum, unit) => sum + unit.landownerIds.size, 0),
        administrativeUnits: adminUnits.map(unit => ({
          id: unit.id,
          name: unit.name,
          landRecordCount: statsByAdminUnit[unit.id]?.landRecordCount || 0,
          landownerCount: statsByAdminUnit[unit.id]?.landownerIds.size || 0,
          ownershipTypes: statsByAdminUnit[unit.id]?.ownershipTypes || {},
          landUses: statsByAdminUnit[unit.id]?.landUses || {},
          zoningTypes: statsByAdminUnit[unit.id]?.zoningTypes || {}
        }))
      }
    };

    return stats;

  } catch (error) {
    console.error('Error in getOversightOfficeStatsService:', error);
    throw new Error(error.message || "Failed to get oversight office statistics");
  }
};
module.exports = {
  createOversightOfficeService,
  getAllOversightOfficesService,
  getOversightOfficeByIdService,
  updateOversightOfficeService,
  deleteOversightOfficeService,
  getOversightOfficeStatsService,
};