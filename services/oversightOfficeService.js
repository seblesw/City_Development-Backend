const { Op } = require("sequelize");
const {
  OversightOffice,
  Region,
  Zone,
  Woreda,
  AdministrativeUnit,
} = require("../models");
exports.createOversightOfficeService = async (data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id } = data;

  try {
    // Check for existing office with same name in the region
    const existingOffice = await OversightOffice.findOne({
      where: {
        name,
        region_id,
        deletedAt: { [Op.eq]: null },
      },
      transaction,
    });

    if (existingOffice) {
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
        throw new Error("ትክክለኛ ወረዳ ይምረጡ።");
      }
    }

    // Find count of offices in this region/zone/woreda
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
    const code = `${regionCode}-${zoneCode}-${woredaCode}-OF${count + 1}`;

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
    throw new Error(error.message || "ቢሮ መፍጠር አልተሳካም።");
  }
};

exports.getAllOversightOfficesService = async (regionId) => {
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

exports.getOversightOfficeByIdService = async (id) => {
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

exports.updateOversightOfficeService = async (
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

exports.deleteOversightOfficeService = async (id, userId, transaction) => {
  try {
    const office = await OversightOffice.findByPk(id, { transaction });
    if (!office) throw new Error("ቢሮ አልተገኘም።");
    await office.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ቢሮ መሰረዝ አልተሳካም።");
  }
};

// oversightOfficeService.js - add this to the existing file
exports.getOversightOfficeStatsService = async (oversightOfficeId) => {
  try {
    // Get the oversight office and its hierarchy level
    const oversightOffice = await OversightOffice.findByPk(oversightOfficeId, {
      include: [
        {
          model: Region,
          as: "region",
          required: true,
          attributes: ["id", "name", "code"],
        },

        {
          model: Zone,
          as: "zone",
          required: false,
          attributes: ["id", "name", "code"],
        },
        {
          model: Woreda,
          as: "woreda",
          required: false,
          attributes: ["id", "name", "code"],
        },
      ],
    });

    if (!oversightOffice) {
      throw new Error("ተቆጣጣሪ ቢሮ አልተገኘም።");
    }

    // Determine the hierarchy level (regional, zonal, or woreda)
    const isRegional = oversightOffice.region_id && !oversightOffice.zone_id;
    const isZonal =
      oversightOffice.region_id &&
      oversightOffice.zone_id &&
      !oversightOffice.woreda_id;
    const isWoreda =
      oversightOffice.region_id &&
      oversightOffice.zone_id &&
      oversightOffice.woreda_id;

    // Build the query to find all oversight offices under this hierarchy
    const where = { deletedAt: { [Op.eq]: null } };

    if (isRegional) {
      where.region_id = oversightOffice.region_id;
    } else if (isZonal) {
      where.region_id = oversightOffice.region_id;
      where.zone_id = oversightOffice.zone_id;
    } else if (isWoreda) {
      where.region_id = oversightOffice.region_id;
      where.zone_id = oversightOffice.zone_id;
      where.woreda_id = oversightOffice.woreda_id;
    }

    // Get all oversight offices under this hierarchy
    const offices = await OversightOffice.findAll({
      where,
      include: [
        {
          model: AdministrativeUnit,
          as: "administrativeUnits",
          where: { deletedAt: { [Op.eq]: null } },
          required: false,
          include: [
            // Include any related models you need for stats (land records, owners, etc.)
            // Example:
            // { model: LandRecord, where: { deletedAt: { [Op.eq]: null } },
            // { model: Owner, where: { deletedAt: { [Op.eq]: null } },
          ],
        },
      ],
    });

    // Calculate statistics
    const stats = {
      oversightOffice: {
        id: oversightOffice.id,
        name: oversightOffice.name,
        level: isRegional ? "regional" : isZonal ? "zonal" : "woreda",
      },
      totalOffices: offices.length,
      totalAdministrativeUnits: 0,
      // Add other statistics you need
      administrativeUnits: [],
    };

    // Process each office and its administrative units
    for (const office of offices) {
      if (office.administrativeUnits && office.administrativeUnits.length > 0) {
        stats.totalAdministrativeUnits += office.administrativeUnits.length;

        for (const unit of office.administrativeUnits) {
          // Calculate statistics for each administrative unit
          const unitStats = {
            id: unit.id,
            name: unit.name,
            // Add other unit properties you need
            // landRecordsCount: unit.LandRecords ? unit.LandRecords.length : 0,
            // ownersCount: unit.Owners ? unit.Owners.length : 0,
          };
          stats.administrativeUnits.push(unitStats);
        }
      }
    }

    return stats;
  } catch (error) {
    throw new Error(error.message || "የተቆጣጣሪ ቢሮ ስታቲስቲክስ ማግኘት አልተሳካም።");
  }
};
