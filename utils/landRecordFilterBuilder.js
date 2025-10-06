// utils/landRecordFilterBuilder.js
const { Op } = require('sequelize');

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
    priority,
    notification_status,
    is_draft,
    
    // Land bank specific
    infrastructure_status,
    land_bank_code,
    land_history,
    
    // Institution specific
    institution_name,
    
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
    
  } = queryParams;

  const whereConditions = {};

  // === EXACT MATCH FILTERS ===
  if (parcel_number) whereConditions.parcel_number = parcel_number;
  if (block_number) whereConditions.block_number = block_number;
  if (land_bank_code) whereConditions.land_bank_code = land_bank_code;
  if (institution_name) whereConditions.institution_name = institution_name;

  // === ENUM FILTERS ===
  if (ownership_category) whereConditions.ownership_category = ownership_category;
  if (land_use) whereConditions.land_use = land_use;
  if (ownership_type) whereConditions.ownership_type = ownership_type;
  if (lease_ownership_type) whereConditions.lease_ownership_type = lease_ownership_type;
  if (record_status) whereConditions.record_status = record_status;
  if (priority) whereConditions.priority = priority;
  if (notification_status) whereConditions.notification_status = notification_status;
  if (zoning_type) whereConditions.zoning_type = zoning_type;
  if (infrastructure_status) whereConditions.infrastructure_status = infrastructure_status;
  if (land_history) whereConditions.land_history = land_history;

  // === BOOLEAN FILTERS ===
  if (has_debt !== undefined) {
    whereConditions.has_debt = has_debt === 'true' || has_debt === true;
  }
  if (is_draft !== undefined) {
    whereConditions.is_draft = is_draft === 'true' || is_draft === true;
  }

  // === NUMERIC FILTERS ===
  if (administrative_unit_id) {
    whereConditions.administrative_unit_id = parseInt(administrative_unit_id);
  }
  if (land_level) {
    whereConditions.land_level = parseInt(land_level);
  }
  if (created_by) {
    whereConditions.created_by = parseInt(created_by);
  }
  if (approved_by) {
    whereConditions.approved_by = parseInt(approved_by);
  }

  // === RANGE FILTERS ===
  // Area range
  if (area_min !== undefined || area_max !== undefined) {
    whereConditions.area = {};
    if (area_min !== undefined) whereConditions.area[Op.gte] = parseFloat(area_min);
    if (area_max !== undefined) whereConditions.area[Op.lte] = parseFloat(area_max);
  }

  // Date ranges
  if (created_at_start || created_at_end) {
    whereConditions.createdAt = {};
    if (created_at_start) whereConditions.createdAt[Op.gte] = new Date(created_at_start);
    if (created_at_end) whereConditions.createdAt[Op.lte] = new Date(created_at_end);
  }

  if (updated_at_start || updated_at_end) {
    whereConditions.updatedAt = {};
    if (updated_at_start) whereConditions.updatedAt[Op.gte] = new Date(updated_at_start);
    if (updated_at_end) whereConditions.updatedAt[Op.lte] = new Date(updated_at_end);
  }

  // === TEXT SEARCH FILTERS ===
  if (north_neighbor) whereConditions.north_neighbor = { [Op.iLike]: `%${north_neighbor}%` };
  if (east_neighbor) whereConditions.east_neighbor = { [Op.iLike]: `%${east_neighbor}%` };
  if (south_neighbor) whereConditions.south_neighbor = { [Op.iLike]: `%${south_neighbor}%` };
  if (west_neighbor) whereConditions.west_neighbor = { [Op.iLike]: `%${west_neighbor}%` };
  if (rejection_reason) whereConditions.rejection_reason = { [Op.iLike]: `%${rejection_reason}%` };
  if (notes) whereConditions.notes = { [Op.iLike]: `%${notes}%` };
  if (address) whereConditions.address = { [Op.iLike]: `%${address}%` };
  if (plan) whereConditions.plan = { [Op.iLike]: `%${plan}%` };

  // === GLOBAL SEARCH ===
  if (search) {
    whereConditions[Op.or] = [
      { parcel_number: { [Op.iLike]: `%${search}%` } },
      { block_number: { [Op.iLike]: `%${search}%` } },
      { block_special_name: { [Op.iLike]: `%${search}%` } },
      { address: { [Op.iLike]: `%${search}%` } },
      { notes: { [Op.iLike]: `%${search}%` } },
      { land_bank_code: { [Op.iLike]: `%${search}%` } },
      { institution_name: { [Op.iLike]: `%${search}%` } },
      { remark: { [Op.iLike]: `%${search}%` } },
      { north_neighbor: { [Op.iLike]: `%${search}%` } },
      { east_neighbor: { [Op.iLike]: `%${search}%` } },
      { south_neighbor: { [Op.iLike]: `%${search}%` } },
      { west_neighbor: { [Op.iLike]: `%${search}%` } }
    ];
  }

  return whereConditions;
};

/**
 * Build sorting options for LandRecord queries
 * @param {Object} queryParams - Request query parameters
 * @returns {Array} Sequelize order conditions
 */
const buildLandRecordSorting = (queryParams) => {
  const {
    sort_by = 'createdAt',
    sort_order = 'DESC'
  } = queryParams;

  const validSortFields = [
    'parcel_number', 'area', 'land_level', 'createdAt', 'updatedAt', 
    'record_status', 'priority', 'land_use', 'block_number',
    'ownership_type', 'zoning_type'
  ];
  
  const sortField = validSortFields.includes(sort_by) ? sort_by : 'createdAt';
  const sortDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  
  return [[sortField, sortDirection]];
};

module.exports = {
  buildLandRecordFilters,
  buildLandRecordSorting
};