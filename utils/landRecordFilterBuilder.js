const { Op } = require('sequelize');
const { LandPayment, Document, User, AdministrativeUnit } = require('../models');

/**
 * Build robust filter conditions for LandRecord queries
 * @param {Object} queryParams - Request query parameters
 * @returns {Object} Sequelize where conditions
 */
const buildLandRecordFilters = (queryParams) => {
  const {
    // Basic filters
    parcel_number,
    administrative_unit_id,
    ownership_category,
    area_min,
    area_max,
    has_debt,
    block_number,
    land_level,
    land_use,
    ownership_type,
    lease_ownership_type,
    
    // Status filters
    record_status,
    
    // Land bank specific
    infrastructure_status,
    land_bank_code,
    land_history,
    
    // Zoning
    zoning_type,
    
    // Date ranges
    created_at_start,
    created_at_end,
    updated_at_start,
    updated_at_end,
    
    // User filters
    created_by,
    approved_by,
    
    // Search across multiple fields
    search,
    
    // Neighbor filters
    north_neighbor,
    east_neighbor,
    south_neighbor,
    west_neighbor,
    
    // Special cases
    rejection_reason,
    notes,
    address,
    plan,

    // Text search filters from frontend - THESE ARE THE KEY PARAMETERS
    plotNumber,
    ownerName,
    phoneNumber,
    nationalId,
    parcelNumber,
    blockNumber,
    
  } = queryParams;

  const whereConditions = {};

  console.log('🔍 Received queryParams:', JSON.stringify(queryParams, null, 2));

  // === EXACT MATCH FILTERS ===
  // Handle both parameter names for compatibility
  if (parcel_number) {
    whereConditions.parcel_number = { [Op.iLike]: `%${parcel_number}%` };
    console.log(`✅ Applied parcel_number filter: ${parcel_number}`);
  }
  if (parcelNumber) {
    whereConditions.parcel_number = { [Op.iLike]: `%${parcelNumber}%` };
    console.log(`✅ Applied parcelNumber filter: ${parcelNumber}`);
  }
  
  if (block_number) {
    whereConditions.block_number = { [Op.iLike]: `%${block_number}%` };
    console.log(`✅ Applied block_number filter: ${block_number}`);
  }
  if (blockNumber) {
    whereConditions.block_number = { [Op.iLike]: `%${blockNumber}%` };
    console.log(`✅ Applied blockNumber filter: ${blockNumber}`);
  }
  
  if (land_bank_code) {
    whereConditions.land_bank_code = { [Op.iLike]: `%${land_bank_code}%` };
    console.log(`✅ Applied land_bank_code filter: ${land_bank_code}`);
  }

  // === ENUM FILTERS ===
  if (ownership_category) {
    whereConditions.ownership_category = ownership_category;
    console.log(`✅ Applied ownership_category filter: ${ownership_category}`);
  }
  if (land_use) {
    whereConditions.land_use = land_use;
    console.log(`✅ Applied land_use filter: ${land_use}`);
  }
  if (ownership_type) {
    whereConditions.ownership_type = ownership_type;
    console.log(`✅ Applied ownership_type filter: ${ownership_type}`);
  }
  if (lease_ownership_type) {
    whereConditions.lease_ownership_type = lease_ownership_type;
    console.log(`✅ Applied lease_ownership_type filter: ${lease_ownership_type}`);
  }
  if (record_status) {
    whereConditions.record_status = record_status;
    console.log(`✅ Applied record_status filter: ${record_status}`);
  }
  if (zoning_type) {
    whereConditions.zoning_type = zoning_type;
    console.log(`✅ Applied zoning_type filter: ${zoning_type}`);
  }
  if (infrastructure_status) {
    whereConditions.infrastructure_status = infrastructure_status;
    console.log(`✅ Applied infrastructure_status filter: ${infrastructure_status}`);
  }
  if (land_history) {
    whereConditions.land_history = land_history;
    console.log(`✅ Applied land_history filter: ${land_history}`);
  }

  // === BOOLEAN FILTERS ===
  if (has_debt !== undefined && has_debt !== '') {
    whereConditions.has_debt = has_debt === 'true' || has_debt === true;
    console.log(`✅ Applied has_debt filter: ${has_debt}`);
  }

  // === NUMERIC FILTERS ===
  if (administrative_unit_id && !isNaN(administrative_unit_id)) {
    whereConditions.administrative_unit_id = parseInt(administrative_unit_id);
    console.log(`✅ Applied administrative_unit_id filter: ${administrative_unit_id}`);
  }
  if (land_level && !isNaN(land_level)) {
    whereConditions.land_level = parseInt(land_level);
    console.log(`✅ Applied land_level filter: ${land_level}`);
  }
  if (created_by && !isNaN(created_by)) {
    whereConditions.created_by = parseInt(created_by);
    console.log(`✅ Applied created_by filter: ${created_by}`);
  }
  if (approved_by && !isNaN(approved_by)) {
    whereConditions.approved_by = parseInt(approved_by);
    console.log(`✅ Applied approved_by filter: ${approved_by}`);
  }

  // === RANGE FILTERS ===
  // Area range
  if (area_min !== undefined && area_min !== '' || area_max !== undefined && area_max !== '') {
    whereConditions.area = {};
    if (area_min !== undefined && area_min !== '') {
      whereConditions.area[Op.gte] = parseFloat(area_min);
      console.log(`✅ Applied area_min filter: ${area_min}`);
    }
    if (area_max !== undefined && area_max !== '') {
      whereConditions.area[Op.lte] = parseFloat(area_max);
      console.log(`✅ Applied area_max filter: ${area_max}`);
    }
  }

  // Date ranges
  if (created_at_start || created_at_end) {
    whereConditions.createdAt = {};
    if (created_at_start) {
      whereConditions.createdAt[Op.gte] = new Date(created_at_start);
      console.log(`✅ Applied created_at_start filter: ${created_at_start}`);
    }
    if (created_at_end) {
      whereConditions.createdAt[Op.lte] = new Date(created_at_end);
      console.log(`✅ Applied created_at_end filter: ${created_at_end}`);
    }
  }

  if (updated_at_start || updated_at_end) {
    whereConditions.updatedAt = {};
    if (updated_at_start) {
      whereConditions.updatedAt[Op.gte] = new Date(updated_at_start);
      console.log(`✅ Applied updated_at_start filter: ${updated_at_start}`);
    }
    if (updated_at_end) {
      whereConditions.updatedAt[Op.lte] = new Date(updated_at_end);
      console.log(`✅ Applied updated_at_end filter: ${updated_at_end}`);
    }
  }

  // === TEXT SEARCH FILTERS ===
  if (north_neighbor) {
    whereConditions.north_neighbor = { [Op.iLike]: `%${north_neighbor}%` };
    console.log(`✅ Applied north_neighbor filter: ${north_neighbor}`);
  }
  if (east_neighbor) {
    whereConditions.east_neighbor = { [Op.iLike]: `%${east_neighbor}%` };
    console.log(`✅ Applied east_neighbor filter: ${east_neighbor}`);
  }
  if (south_neighbor) {
    whereConditions.south_neighbor = { [Op.iLike]: `%${south_neighbor}%` };
    console.log(`✅ Applied south_neighbor filter: ${south_neighbor}`);
  }
  if (west_neighbor) {
    whereConditions.west_neighbor = { [Op.iLike]: `%${west_neighbor}%` };
    console.log(`✅ Applied west_neighbor filter: ${west_neighbor}`);
  }
  if (rejection_reason) {
    whereConditions.rejection_reason = { [Op.iLike]: `%${rejection_reason}%` };
    console.log(`✅ Applied rejection_reason filter: ${rejection_reason}`);
  }
  if (notes) {
    whereConditions.notes = { [Op.iLike]: `%${notes}%` };
    console.log(`✅ Applied notes filter: ${notes}`);
  }
  if (address) {
    whereConditions.address = { [Op.iLike]: `%${address}%` };
    console.log(`✅ Applied address filter: ${address}`);
  }
  if (plan) {
    whereConditions.plan = { [Op.iLike]: `%${plan}%` };
    console.log(`✅ Applied plan filter: ${plan}`);
  }

  // === GLOBAL SEARCH ===
  if (search) {
    whereConditions[Op.or] = [
      { parcel_number: { [Op.iLike]: `%${search}%` } },
      { block_number: { [Op.iLike]: `%${search}%` } },
      { block_special_name: { [Op.iLike]: `%${search}%` } },
      { address: { [Op.iLike]: `%${search}%` } },
      { notes: { [Op.iLike]: `%${search}%` } },
      { land_bank_code: { [Op.iLike]: `%${search}%` } },
      { remark: { [Op.iLike]: `%${search}%` } },
      { north_neighbor: { [Op.iLike]: `%${search}%` } },
      { east_neighbor: { [Op.iLike]: `%${search}%` } },
      { south_neighbor: { [Op.iLike]: `%${search}%` } },
      { west_neighbor: { [Op.iLike]: `%${search}%` } }
    ];
    console.log(`✅ Applied global search filter: ${search}`);
  }

  // Store relationship filters separately - THESE ARE CRITICAL FOR plotNumber
  const relationshipFilters = {};
  if (plotNumber) {
    relationshipFilters.plotNumber = plotNumber;
    console.log(`🔗 Stored plotNumber relationship filter: ${plotNumber}`);
  }
  if (ownerName) {
    relationshipFilters.ownerName = ownerName;
    console.log(`🔗 Stored ownerName relationship filter: ${ownerName}`);
  }
  if (nationalId) {
    relationshipFilters.nationalId = nationalId;
    console.log(`🔗 Stored nationalId relationship filter: ${nationalId}`);
  }
  if (phoneNumber) {
    relationshipFilters.phoneNumber = phoneNumber;
    console.log(`🔗 Stored phoneNumber relationship filter: ${phoneNumber}`);
  }

  // Clean up empty objects
  Object.keys(whereConditions).forEach(key => {
    if (whereConditions[key] && typeof whereConditions[key] === 'object' && Object.keys(whereConditions[key]).length === 0) {
      delete whereConditions[key];
    }
  });

  const result = {
    conditions: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
    relationshipFilters: Object.keys(relationshipFilters).length > 0 ? relationshipFilters : undefined
  };

  console.log('🎯 Final filter result:', JSON.stringify(result, null, 2));
  return result;
};

/**
 * Build include conditions for related models with filtering
 */
const buildIncludeConditions = (queryParams, includeDeleted = false) => {
  const { 
    plotNumber, // Document.plot_number
    ownerName,  // User.first_name, User.middle_name, User.last_name
    phoneNumber, // User.phone_number
    nationalId   // User.national_id
  } = queryParams;

  console.log('📋 Building include conditions with:', {
    plotNumber,
    ownerName, 
    phoneNumber,
    nationalId
  });

  const includeConditions = [
    {
      model: User,
      as: "owners",
      through: {
        attributes: [], 
      },
      attributes: [
        "id",
        "first_name",
        "middle_name",
        "last_name",
        "national_id",
        "email",
        "phone_number",
        "address",
      ],
      where: {}, 
      required: false, 
      paranoid: !includeDeleted,
    },
    {
      model: AdministrativeUnit,
      as: "administrativeUnit",
      attributes: ["id", "name", "max_land_levels"],
      required: false, 
    },
    {
      model: User,
      as: "creator",
      attributes: ["id", "first_name", "middle_name", "last_name"],
      required: false,
    },
    {
      model: User,
      as: "approver",
      attributes: ["id", "first_name", "middle_name", "last_name"],
      required: false,
    },
    {
      model: Document,
      as: "documents",
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "files",
        "issue_date",
        "isActive",
      ],
      where: includeDeleted ? {} : { deletedAt: null },
      required: false, 
      paranoid: !includeDeleted,
      limit: 5,
    },
    {
      model: LandPayment,
      as: "payments",
      attributes: [
        "id",
        "payment_type",
        "total_amount",
        "paid_amount",
        "currency",
        "payment_status",
      ],
      where: includeDeleted ? {} : { deletedAt: null },
      required: false,
      paranoid: !includeDeleted,
      limit: 5,
    },
  ];

  // Apply owner filters
  if (ownerName || nationalId || phoneNumber) {
    const ownerInclude = includeConditions.find(inc => inc.as === "owners");
    if (ownerInclude) {
      ownerInclude.where = {};
      ownerInclude.where[Op.or] = [];
      
      if (ownerName) {
        ownerInclude.where[Op.or].push(
          { first_name: { [Op.iLike]: `%${ownerName}%` } },
          { middle_name: { [Op.iLike]: `%${ownerName}%` } },
          { last_name: { [Op.iLike]: `%${ownerName}%` } }
        );
        console.log(`👤 Applied ownerName filter in include: ${ownerName}`);
      }
      if (nationalId) {
        ownerInclude.where[Op.or].push({ national_id: { [Op.iLike]: `%${nationalId}%` } });
        console.log(`🆔 Applied nationalId filter in include: ${nationalId}`);
      }
      if (phoneNumber) {
        ownerInclude.where[Op.or].push({ phone_number: { [Op.iLike]: `%${phoneNumber}%` } });
        console.log(`📞 Applied phoneNumber filter in include: ${phoneNumber}`);
      }
      
      ownerInclude.required = true;
      console.log('✅ Owner include conditions set to required');
    }
  }

  // Apply document filters for plotNumber - THIS IS THE KEY FIX
  if (plotNumber) {
    const documentInclude = includeConditions.find(inc => inc.as === "documents");
    if (documentInclude) {
      documentInclude.where = {
        ...documentInclude.where,
        plot_number: { [Op.iLike]: `%${plotNumber}%` }
      };
      documentInclude.required = true; // This makes it an INNER JOIN
      console.log(`📄 Applied plotNumber filter in documents include: ${plotNumber}`);
      console.log('✅ Document include conditions set to required');
    }
  }

  console.log('🎯 Final include conditions:', JSON.stringify(includeConditions.map(inc => ({
    model: inc.model.name,
    as: inc.as,
    required: inc.required,
    where: inc.where
  })), null, 2));

  return includeConditions;
};

// Make sure you have the sorting function too
const buildLandRecordSorting = (queryParams) => {
  const {
    sort_by = 'createdAt',
    sort_order = 'DESC'
  } = queryParams;

  const validSortFields = [
    'parcel_number', 'area', 'land_level', 'createdAt', 'updatedAt', 
    'record_status', 'land_use', 'block_number', 'block_special_name',
    'ownership_type', 'zoning_type', 'infrastructure_status',
    'land_bank_code', 'address', 'institution_name', 'landbank_registrer_name',
    'priority', 'notification_status', 'is_draft'
  ];
  
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'createdAt';
  const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  return [[sortField, sortDirection]];
};

module.exports = {
  buildLandRecordFilters,
  buildLandRecordSorting,
  buildIncludeConditions
};