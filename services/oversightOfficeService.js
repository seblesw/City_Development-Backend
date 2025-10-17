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
  LEASE_TRANSFER_REASONS,
  LEASE_OWNERSHIP_TYPE,
} = require("../models");
const createOversightOfficeService = async (data, userId, transaction) => {
  const { name, region_id, zone_id, woreda_id } = data;

  try {
    
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

    
    const region = await Region.findByPk(region_id, { transaction });
    if (!region) {
      throw new Error("ትክክለኛ ክልል ይምረጡ።");
    }

    
    let zone = null;
    if (zone_id) {
      zone = await Zone.findByPk(zone_id, { transaction });
      if (!zone || zone.region_id !== region.id) {
        throw new Error("ትክክለኛ ዞን ይምረጡ።");
      }
    }

    
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

    
    let code;
    let attempts = 0;
    const maxAttempts = 5;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      
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
    // 1. Fetch oversight office with hierarchy
    const oversightOffice = await OversightOffice.findByPk(oversightOfficeId, {
      include: [
        { model: Region, as: "region", attributes: ["id", "name", "code"] },
        { model: Zone, as: "zone", attributes: ["id", "name", "code"] },
        { model: Woreda, as: "woreda", attributes: ["id", "name", "code"] },
      ],
    });

    if (!oversightOffice) {
      throw new Error("Oversight office not found");
    }

    // 2. Determine office level based on hierarchy
    const officeLevel = determineOfficeLevel(oversightOffice);

    // 3. Build where clause based on office level
    const where = { deletedAt: null };
    if (officeLevel === 'woreda') {
      where.woreda_id = oversightOffice.woreda_id;
      where.zone_id = oversightOffice.zone_id;
    } else if (officeLevel === 'zonal') {
      where.zone_id = oversightOffice.zone_id;
    }
    where.region_id = oversightOffice.region_id;

    // 4. Get all offices in the hierarchy
    const offices = await OversightOffice.findAll({
      where,
      include: [{
        model: AdministrativeUnit,
        as: "administrativeUnits",
        where: { deletedAt: null },
        required: false,
        attributes: ["id", "name", "code","unit_level","type","max_land_levels", "createdAt"]
      }],
      attributes: ["id", "name", "region_id", "zone_id", "woreda_id"]
    });

    // 5. Extract all administrative unit IDs
    const adminUnitIds = offices.flatMap(office => 
      office.administrativeUnits.map(unit => unit.id)
    ).filter(id => id);

    // 6. If no administrative units, return early with basic info
    if (adminUnitIds.length === 0) {
      return {
        status: "success",
        data: {
          oversightOffice: getOversightOfficeInfo(oversightOffice, officeLevel),
          totalOffices: offices.length,
          totalAdministrativeUnits: 0,
          totalLandRecords: 0,
          totalLandowners: 0,
          totalArea: 0,
          areaStats: getEmptyAreaStats(),
          administrativeUnits: [],
          summary: getEmptySummary(),
          timestamp: new Date().toISOString()
        }
      };
    }

    // 7. Fetch detailed land records with ALL necessary attributes including area_square_meters
    const landRecords = await LandRecord.findAll({
      where: {
        administrative_unit_id: { [Op.in]: adminUnitIds },
        deletedAt: null
      },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [] },
          required: false,
          attributes: ["id", "first_name", "last_name", "middle_name"]
        },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name", "code","type","unit_level","max_land_levels"]
        }
      ],
      
    });

    // 8. Initialize statistics aggregators
    const statsByAdminUnit = initializeAdminUnitStats(adminUnitIds);
    const globalStats = initializeGlobalStats();

    // 9. Process each land record to aggregate statistics
    landRecords.forEach(record => {
      const adminUnitId = record.administrative_unit_id;
      const areaInSquareMeters = record.area || 0;
      const areaInHectares = areaInSquareMeters / 10000;
      
      // Update administrative unit statistics
      updateAdminUnitStats(statsByAdminUnit[adminUnitId], record, areaInSquareMeters, areaInHectares);
      
      // Update global statistics
      updateGlobalStats(globalStats, record, areaInSquareMeters, areaInHectares);
    });

    // 10. Fetch administrative units with details
    const adminUnits = await AdministrativeUnit.findAll({
      where: { id: { [Op.in]: adminUnitIds } },
      attributes: ["id", "name", "code","unit_level","type","max_land_levels", "createdAt"]
    });

    // 11. Prepare final administrative units data with calculated statistics
    const administrativeUnitsData = adminUnits.map(unit => {
      const unitStats = statsByAdminUnit[unit.id] || getEmptyUnitStats();
      
      return {
        id: unit.id,
        name: unit.name,
        code: unit.code,
        unit_level: unit.unit_level,
        type: unit.type,
        max_land_levels: unit.max_land_levels,
        createdAt: unit.createdAt,
        
        // Basic counts
        landRecordCount: unitStats.landRecordCount,
        landownerCount: unitStats.landownerIds.size,
        
        // Area information - store in both square meters and hectares
        totalAreaSquareMeters: unitStats.totalAreaSquareMeters,
        totalArea: unitStats.totalAreaHectares, // hectares for backward compatibility
        avgAreaPerRecord: unitStats.landRecordCount > 0 ? unitStats.totalAreaHectares / unitStats.landRecordCount : 0,
        minArea: unitStats.minArea,
        maxArea: unitStats.maxArea,
        
        // Distribution by types - store areas in hectares
        ownershipTypes: unitStats.ownershipTypes.count,
        ownershipTypeAreas: unitStats.ownershipTypes.area,
        
        landUses: unitStats.landUses.count,
        landUseAreas: unitStats.landUses.area,
        
        zoningTypes: unitStats.zoningTypes.count,
        zoningTypeAreas: unitStats.zoningTypes.area,
        
        leaseOwnershipTypes: unitStats.leaseOwnershipTypes.count,
        leaseOwnershipTypeAreas: unitStats.leaseOwnershipTypes.area,
        
        leaseTransferReasons: unitStats.leaseTransferReasons.count,
        leaseTransferReasonAreas: unitStats.leaseTransferReasons.area,
        
        // Performance metrics
        areaPerOwner: unitStats.landownerIds.size > 0 ? unitStats.totalAreaHectares / unitStats.landownerIds.size : 0,
        recordDensity: unitStats.totalAreaHectares > 0 ? unitStats.landRecordCount / unitStats.totalAreaHectares : 0
      };
    });

    // 12. Calculate summary statistics
    const summary = calculateSummaryStatistics(administrativeUnitsData, landRecords.length, globalStats);

    // 13. Prepare final response
    const response = {
      status: "success",
      data: {
        oversightOffice: getOversightOfficeInfo(oversightOffice, officeLevel),
        
        // Basic counts
        totalOffices: offices.length,
        totalAdministrativeUnits: adminUnitIds.length,
        totalLandRecords: landRecords.length,
        totalLandowners: globalStats.totalLandowners,
        
        // Area statistics - provide both square meters and hectares
        totalArea: globalStats.totalAreaHectares, // hectares for backward compatibility
        totalAreaSquareMeters: globalStats.totalAreaSquareMeters,
        areaStats: {
          totalAreaSquareMeters: globalStats.totalAreaSquareMeters,
          totalAreaHectares: globalStats.totalAreaHectares,
          totalAreaKm2: globalStats.totalAreaHectares / 100,
          avgAreaPerRecord: landRecords.length > 0 ? globalStats.totalAreaHectares / landRecords.length : 0,
          avgAreaPerOwner: globalStats.totalLandowners > 0 ? globalStats.totalAreaHectares / globalStats.totalLandowners : 0,
          minArea: globalStats.minArea,
          maxArea: globalStats.maxArea,
          areaDistribution: globalStats.areaDistribution
        },
        
        // Administrative units with detailed stats
        administrativeUnits: administrativeUnitsData,
        
        // Global distributions
        globalDistributions: {
          ownershipTypes: globalStats.ownershipTypes,
          landUses: globalStats.landUses,
          zoningTypes: globalStats.zoningTypes,
          leaseOwnershipTypes: globalStats.leaseOwnershipTypes,
          leaseTransferReasons: globalStats.leaseTransferReasons
        },
        
        // Summary metrics
        summary: summary,
        
        // Metadata
        timestamp: new Date().toISOString(),
        dataVersion: "1.0"
      }
    };

    return response;

  } catch (error) {
    console.error("Error in getOversightOfficeStatsService:", error);
    throw new Error(error.message || "Failed to get oversight office statistics");
  }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Determine office level based on hierarchy presence
 */
const determineOfficeLevel = (oversightOffice) => {
  if (oversightOffice.woreda_id && oversightOffice.zone_id && oversightOffice.region_id) {
    return 'woreda';
  } else if (oversightOffice.zone_id && oversightOffice.region_id) {
    return 'zonal';
  } else if (oversightOffice.region_id) {
    return 'regional';
  } else {
    return 'unknown';
  }
};

/**
 * Get oversight office information in standardized format
 */
const getOversightOfficeInfo = (oversightOffice, level) => {
  return {
    id: oversightOffice.id,
    name: oversightOffice.name,
    level: level,
    region: oversightOffice.region,
    zone: oversightOffice.zone,
    woreda: oversightOffice.woreda,
    hierarchy: {
      region: oversightOffice.region?.name,
      zone: oversightOffice.zone?.name,
      woreda: oversightOffice.woreda?.name
    },
    // Include IDs for reference
    region_id: oversightOffice.region_id,
    zone_id: oversightOffice.zone_id,
    woreda_id: oversightOffice.woreda_id
  };
};

/**
 * Initialize statistics structure for administrative units
 */
const initializeAdminUnitStats = (adminUnitIds) => {
  const stats = {};
  const ownershipTypeValues = Object.values(OWNERSHIP_TYPES);
  const landUseValues = Object.values(LAND_USE_TYPES);
  const zoningTypeValues = Object.values(ZONING_TYPES);
  const leaseOwnershipTypeValues = Object.values(LEASE_OWNERSHIP_TYPE || {});
  const leaseTransferReasonValues = Object.values(LEASE_TRANSFER_REASONS || {});

  adminUnitIds.forEach(adminUnitId => {
    stats[adminUnitId] = {
      landRecordCount: 0,
      landownerIds: new Set(),
      totalAreaSquareMeters: 0,  
      totalAreaHectares: 0,     
      minArea: null,
      maxArea: 0,
      
      ownershipTypes: {
        count: initializeCountObject(ownershipTypeValues),
        area: initializeCountObject(ownershipTypeValues) 
      },
      
      landUses: {
        count: initializeCountObject(landUseValues),
        area: initializeCountObject(landUseValues) 
      },
      
      zoningTypes: {
        count: initializeCountObject(zoningTypeValues),
        area: initializeCountObject(zoningTypeValues) 
      },
      
      leaseOwnershipTypes: {
        count: initializeCountObject(leaseOwnershipTypeValues),
        area: initializeCountObject(leaseOwnershipTypeValues) 
      },
      
      leaseTransferReasons: {
        count: initializeCountObject(leaseTransferReasonValues),
        area: initializeCountObject(leaseTransferReasonValues) 
      }
    };
  });

  return stats;
};

/**
 * Initialize global statistics aggregator
 */
const initializeGlobalStats = () => {
  const ownershipTypeValues = Object.values(OWNERSHIP_TYPES);
  const landUseValues = Object.values(LAND_USE_TYPES);
  const zoningTypeValues = Object.values(ZONING_TYPES);
  const leaseOwnershipTypeValues = Object.values(LEASE_OWNERSHIP_TYPE || {});
  const leaseTransferReasonValues = Object.values(LEASE_TRANSFER_REASONS || {});

  return {
    totalLandowners: 0,
    totalAreaSquareMeters: 0,  // Store in square meters
    totalAreaHectares: 0,      // Store in hectares
    minArea: null,
    maxArea: 0,
    areaDistribution: {
      '0-1': 0,    // 0-1 hectare
      '1-5': 0,    // 1-5 hectares
      '5-10': 0,   // 5-10 hectares
      '10-50': 0,  // 10-50 hectares
      '50+': 0     // 50+ hectares
    },
    landownerIds: new Set(),
    
    ownershipTypes: {
      count: initializeCountObject(ownershipTypeValues),
      area: initializeCountObject(ownershipTypeValues) // hectares
    },
    
    landUses: {
      count: initializeCountObject(landUseValues),
      area: initializeCountObject(landUseValues) // hectares
    },
    
    zoningTypes: {
      count: initializeCountObject(zoningTypeValues),
      area: initializeCountObject(zoningTypeValues) // hectares
    },
    
    leaseOwnershipTypes: {
      count: initializeCountObject(leaseOwnershipTypeValues),
      area: initializeCountObject(leaseOwnershipTypeValues) // hectares
    },
    
    leaseTransferReasons: {
      count: initializeCountObject(leaseTransferReasonValues),
      area: initializeCountObject(leaseTransferReasonValues) // hectares
    }
  };
};

/**
 * Initialize count object with zero values for all keys
 */
const initializeCountObject = (values) => {
  const obj = {};
  values.forEach(value => {
    obj[value] = 0;
  });
  return obj;
};

/**
 * Update administrative unit statistics for a single land record
 */
const updateAdminUnitStats = (unitStats, record, areaInSquareMeters, areaInHectares) => {
  // Basic counts
  unitStats.landRecordCount++;
  
  // Area calculations - sum in both square meters and hectares
  unitStats.totalAreaSquareMeters += areaInSquareMeters;
  unitStats.totalAreaHectares += areaInHectares;
  
  // Area range tracking (in hectares for consistency)
  if (unitStats.minArea === null || areaInHectares < unitStats.minArea) {
    unitStats.minArea = areaInHectares;
  }
  if (areaInHectares > unitStats.maxArea) {
    unitStats.maxArea = areaInHectares;
  }
  
  // Update type distributions (area in hectares)
  updateTypeDistribution(unitStats.ownershipTypes, record.ownership_type, areaInHectares);
  updateTypeDistribution(unitStats.landUses, record.land_use, areaInHectares);
  updateTypeDistribution(unitStats.zoningTypes, record.zoning_type, areaInHectares);
  updateTypeDistribution(unitStats.leaseOwnershipTypes, record.lease_ownership_type, areaInHectares);
  updateTypeDistribution(unitStats.leaseTransferReasons, record.lease_transfer_reason, areaInHectares);
  
  // Update landowners
  if (record.owners && Array.isArray(record.owners)) {
    record.owners.forEach(owner => {
      if (owner && owner.id) {
        unitStats.landownerIds.add(owner.id);
      }
    });
  }
};

/**
 * Update global statistics for a single land record
 */
const updateGlobalStats = (globalStats, record, areaInSquareMeters, areaInHectares) => {
  // Area statistics - sum in both square meters and hectares
  globalStats.totalAreaSquareMeters += areaInSquareMeters;
  globalStats.totalAreaHectares += areaInHectares;
  
  // Area range tracking (in hectares)
  if (globalStats.minArea === null || areaInHectares < globalStats.minArea) {
    globalStats.minArea = areaInHectares;
  }
  if (areaInHectares > globalStats.maxArea) {
    globalStats.maxArea = areaInHectares;
  }
  
  // Area distribution (in hectares)
  updateAreaDistribution(globalStats.areaDistribution, areaInHectares);
  
  // Update type distributions (area in hectares)
  updateTypeDistribution(globalStats.ownershipTypes, record.ownership_type, areaInHectares);
  updateTypeDistribution(globalStats.landUses, record.land_use, areaInHectares);
  updateTypeDistribution(globalStats.zoningTypes, record.zoning_type, areaInHectares);
  updateTypeDistribution(globalStats.leaseOwnershipTypes, record.lease_ownership_type, areaInHectares);
  updateTypeDistribution(globalStats.leaseTransferReasons, record.lease_transfer_reason, areaInHectares);
  
  // Update landowners
  if (record.owners && Array.isArray(record.owners)) {
    record.owners.forEach(owner => {
      if (owner && owner.id) {
        globalStats.landownerIds.add(owner.id);
      }
    });
  }
  
  globalStats.totalLandowners = globalStats.landownerIds.size;
};

/**
 * Update type distribution (count and area) for a specific type
 */
const updateTypeDistribution = (distribution, type, areaInHectares) => {
  if (type && distribution.count[type] !== undefined) {
    distribution.count[type]++;
    distribution.area[type] += areaInHectares;
  }
};

/**
 * Update area distribution buckets
 */
const updateAreaDistribution = (distribution, areaInHectares) => {
  if (areaInHectares <= 1) {
    distribution['0-1']++;
  } else if (areaInHectares <= 5) {
    distribution['1-5']++;
  } else if (areaInHectares <= 10) {
    distribution['5-10']++;
  } else if (areaInHectares <= 50) {
    distribution['10-50']++;
  } else {
    distribution['50+']++;
  }
};

/**
 * Calculate summary statistics
 */
const calculateSummaryStatistics = (adminUnits, totalRecords, globalStats) => {
  if (adminUnits.length === 0) {
    return getEmptySummary();
  }

  const totalAreaHectares = globalStats.totalAreaHectares;
  const totalOwners = globalStats.totalLandowners;
  
  // Calculate averages
  const avgRecordsPerUnit = totalRecords / adminUnits.length;
  const avgAreaPerUnit = totalAreaHectares / adminUnits.length;
  const avgOwnersPerUnit = totalOwners / adminUnits.length;
  const avgAreaPerRecord = totalRecords > 0 ? totalAreaHectares / totalRecords : 0;
  const avgAreaPerOwner = totalOwners > 0 ? totalAreaHectares / totalOwners : 0;

  // Find top performing units
  const topUnitsByRecords = [...adminUnits]
    .sort((a, b) => b.landRecordCount - a.landRecordCount)
    .slice(0, 5);
  
  const topUnitsByArea = [...adminUnits]
    .sort((a, b) => b.totalArea - a.totalArea)
    .slice(0, 5);
  
  const topUnitsByOwners = [...adminUnits]
    .sort((a, b) => b.landownerCount - a.landownerCount)
    .slice(0, 5);

  // Calculate completion rate (example calculation)
  const potentialRecords = adminUnits.length * 100; // Assuming 100 records per unit as potential
  const completionRate = Math.min(100, (totalRecords / potentialRecords) * 100);

  return {
    // Averages
    avgRecordsPerUnit: parseFloat(avgRecordsPerUnit.toFixed(2)),
    avgAreaPerUnit: parseFloat(avgAreaPerUnit.toFixed(2)),
    avgOwnersPerUnit: parseFloat(avgOwnersPerUnit.toFixed(2)),
    avgAreaPerRecord: parseFloat(avgAreaPerRecord.toFixed(2)),
    avgAreaPerOwner: parseFloat(avgAreaPerOwner.toFixed(2)),
    
    // Top performers
    topUnitsByRecords,
    topUnitsByArea,
    topUnitsByOwners,
    
    // Performance metrics
    completionRate: parseFloat(completionRate.toFixed(1)),
    dataDensity: parseFloat((totalRecords / totalAreaHectares).toFixed(2)), 
    ownerDensity: parseFloat((totalOwners / totalAreaHectares).toFixed(2)), 
    
    // Area statistics
    totalArea: parseFloat(totalAreaHectares.toFixed(2)),
    minArea: globalStats.minArea ? parseFloat(globalStats.minArea.toFixed(2)) : 0,
    maxArea: parseFloat(globalStats.maxArea.toFixed(2)),
    areaDistribution: globalStats.areaDistribution
  };
};

/**
 * Get empty area stats for when no data exists
 */
const getEmptyAreaStats = () => ({
  totalAreaSquareMeters: 0,
  totalAreaHectares: 0,
  totalAreaKm2: 0,
  avgAreaPerRecord: 0,
  avgAreaPerOwner: 0,
  minArea: 0,
  maxArea: 0,
  areaDistribution: {
    '0-1': 0,
    '1-5': 0,
    '5-10': 0,
    '10-50': 0,
    '50+': 0
  }
});

/**
 * Get empty unit stats structure
 */
const getEmptyUnitStats = () => ({
  landRecordCount: 0,
  landownerIds: new Set(),
  totalAreaSquareMeters: 0,
  totalAreaHectares: 0,
  minArea: 0,
  maxArea: 0,
  ownershipTypes: { count: {}, area: {} },
  landUses: { count: {}, area: {} },
  zoningTypes: { count: {}, area: {} },
  leaseOwnershipTypes: { count: {}, area: {} },
  leaseTransferReasons: { count: {}, area: {} }
});

/**
 * Get empty summary for when no data exists
 */
const getEmptySummary = () => ({
  avgRecordsPerUnit: 0,
  avgAreaPerUnit: 0,
  avgOwnersPerUnit: 0,
  avgAreaPerRecord: 0,
  avgAreaPerOwner: 0,
  topUnitsByRecords: [],
  topUnitsByArea: [],
  topUnitsByOwners: [],
  completionRate: 0,
  dataDensity: 0,
  ownerDensity: 0,
  totalArea: 0,
  minArea: 0,
  maxArea: 0,
  areaDistribution: {
    '0-1': 0,
    '1-5': 0,
    '5-10': 0,
    '10-50': 0,
    '50+': 0
  }
});

module.exports = {
  createOversightOfficeService,
  getAllOversightOfficesService,
  getOversightOfficeByIdService,
  updateOversightOfficeService,
  deleteOversightOfficeService,
  getOversightOfficeStatsService,
};