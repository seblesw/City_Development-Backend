const { LandRecord, User, AdministrativeUnit } = require('../models');

exports.createLandRecordService = async (data) => {
  const {
    land_id, owner_id, administrative_unit_id, area, height, width, land_use, ownership_type,
    north_neighbor, south_neighbor, east_neighbor, west_neighbor, address, coordinates,
    registration_date, status, registered_by, approved_by, zoning_code
  } = data;

  if (!land_id || typeof land_id !== 'string' || land_id.length < 1 || land_id.length > 50) {
    throw new Error('Land ID is required and must be 1–50 characters');
  }
  if (!owner_id || isNaN(parseInt(owner_id))) {
    throw new Error('Valid owner ID is required');
  }
  if (!administrative_unit_id || isNaN(parseInt(administrative_unit_id))) {
    throw new Error('Valid administrative unit ID is required');
  }
  if (!area || isNaN(parseFloat(area)) || area <= 0) {
    throw new Error('Area is required and must be a positive number');
  }
  if (height && (isNaN(parseFloat(height)) || height <= 0)) {
    throw new Error('Height must be a positive number if provided');
  }
  if (width && (isNaN(parseFloat(width)) || width <= 0)) {
    throw new Error('Width must be a positive number if provided');
  }
  if (!land_use || !['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed', 'Other'].includes(land_use)) {
    throw new Error('Invalid land use; must be one of: Residential, Commercial, Agricultural, Industrial, Mixed, Other');
  }
  if (!ownership_type || !['Lease', 'Transfer', 'Sale', 'Inheritance', 'Displaced', 'Placemet'].includes(ownership_type)) {
    throw new Error('Invalid ownership type; must be one of: Lease, Transfer, Sale, Inheritance, Displaced, Placemet');
  }
  if (!registration_date || !/^\d{4}-\d{2}-\d{2}$/.test(registration_date)) {
    throw new Error('Registration date is required and must be in YYYY-MM-DD format');
  }
  if (!status || !['Pending', 'Under Review', 'Approved', 'Rejected'].includes(status)) {
    throw new Error('Invalid status; must be one of: Pending, Under Review, Approved, Rejected');
  }
  if (!registered_by || isNaN(parseInt(registered_by))) {
    throw new Error('Valid registered_by ID is required');
  }
  if (approved_by && isNaN(parseInt(approved_by))) {
    throw new Error('Valid approved_by ID is required if provided');
  }
  if (!LandRecord || !User || !AdministrativeUnit) {
    throw new Error('Required models are not defined');
  }

  try {
    // Validate land_id uniqueness
    const existingLand = await LandRecord.findOne({ where: { land_id } });
    if (existingLand) {
      throw new Error('Land ID already exists');
    }

    // Validate owner_id
    const owner = await User.findByPk(owner_id);
    if (!owner) {
      throw new Error('Owner not found');
    }

    // Validate administrative_unit_id
    const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id);
    if (!adminUnit) {
      throw new Error('Administrative unit not found');
    }

    // Validate registered_by
    const registrar = await User.findByPk(registered_by);
    if (!registrar) {
      throw new Error('Registrar not found');
    }

    // Validate approved_by if provided
    if (approved_by) {
      const approver = await User.findByPk(approved_by);
      if (!approver) {
        throw new Error('Approver not found');
      }
    }

    const landRecord = await LandRecord.create({
      land_id, owner_id, administrative_unit_id, area, height, width, land_use, ownership_type,
      north_neighbor, south_neighbor, east_neighbor, west_neighbor, address, coordinates,
      registration_date, status, registered_by, approved_by, zoning_code
    });
    return landRecord;
  } catch (error) {
    throw new Error(`Failed to create land record: ${error.message}`);
  }
};

exports.getAllLandRecordsService = async () => {
  if (!LandRecord) {
    throw new Error('LandRecord model is not defined');
  }
  try {
    const landRecords = await LandRecord.findAll({
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: AdministrativeUnit, as: 'administrativeUnit', attributes: ['id', 'name', 'type'] },
        { model: User, as: 'registrar', attributes: ['id', 'first_name', 'last_name'], where: { id: LandRecord.sequelize.col('LandRecord.registered_by') } },
        { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'], where: { id: LandRecord.sequelize.col('LandRecord.approved_by') }, required: false },
      ],
      order: [['createdAt', 'DESC']],
    });
    return landRecords;
  } catch (error) {
    throw new Error(`Failed to fetch land records: ${error.message}`);
  }
};

exports.getLandRecordByIdService = async (id) => {
  if (!LandRecord) {
    throw new Error('LandRecord model is not defined');
  }
  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  try {
    const landRecord = await LandRecord.findByPk(id, {
      include: [
        { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: AdministrativeUnit, as: 'administrativeUnit', attributes: ['id', 'name', 'type'] },
        { model: User, as: 'registrar', attributes: ['id', 'first_name', 'last_name'], where: { id: LandRecord.sequelize.col('LandRecord.registered_by') } },
        { model: User, as: 'approver', attributes: ['id', 'first_name', 'last_name'], where: { id: LandRecord.sequelize.col('LandRecord.approved_by') }, required: false },
      ],
    });
    if (!landRecord) {
      throw new Error('Land record not found');
    }
    return landRecord;
  } catch (error) {
    throw new Error(`Failed to fetch land record: ${error.message}`);
  }
};

exports.updateLandRecordService = async (id, data) => {
  const {
    land_id, owner_id, administrative_unit_id, area, height, width, land_use, ownership_type,
    north_neighbor, south_neighbor, east_neighbor, west_neighbor, address, coordinates,
    registration_date, status, registered_by, approved_by, zoning_code
  } = data;

  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  if (land_id && (typeof land_id !== 'string' || land_id.length < 1 || land_id.length > 50)) {
    throw new Error('Land ID must be 1–50 characters if provided');
  }
  if (owner_id && isNaN(parseInt(owner_id))) {
    throw new Error('Valid owner ID is required if provided');
  }
  if (administrative_unit_id && isNaN(parseInt(administrative_unit_id))) {
    throw new Error('Valid administrative unit ID is required if provided');
  }
  if (area && (isNaN(parseFloat(area)) || area <= 0)) {
    throw new Error('Area must be a positive number if provided');
  }
  if (height && (isNaN(parseFloat(height)) || height <= 0)) {
    throw new Error('Height must be a positive number if provided');
  }
  if (width && (isNaN(parseFloat(width)) || width <= 0)) {
    throw new Error('Width must be a positive number if provided');
  }
  if (land_use && !['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed', 'Other'].includes(land_use)) {
    throw new Error('Invalid land use; must be one of: Residential, Commercial, Agricultural, Industrial, Mixed, Other');
  }
  if (ownership_type && !['Lease', 'Transfer', 'Sale', 'Inheritance', 'Displaced', 'Placemet'].includes(ownership_type)) {
    throw new Error('Invalid ownership type; must be one of: Lease, Transfer, Sale, Inheritance, Displaced, Placemet');
  }
  if (registration_date && !/^\d{4}-\d{2}-\d{2}$/.test(registration_date)) {
    throw new Error('Registration date must be in YYYY-MM-DD format if provided');
  }
  if (status && !['Pending', 'Under Review', 'Approved', 'Rejected'].includes(status)) {
    throw new Error('Invalid status; must be one of: Pending, Under Review, Approved, Rejected');
  }
  if (registered_by && isNaN(parseInt(registered_by))) {
    throw new Error('Valid registered_by ID is required if provided');
  }
  if (approved_by && isNaN(parseInt(approved_by))) {
    throw new Error('Valid approved_by ID is required if provided');
  }
  if (!LandRecord || !User || !AdministrativeUnit) {
    throw new Error('Required models are not defined');
  }

  try {
    const landRecord = await LandRecord.findByPk(id);
    if (!landRecord) {
      throw new Error('Land record not found');
    }

    // Validate land_id uniqueness
    if (land_id && land_id !== landRecord.land_id) {
      const existingLand = await LandRecord.findOne({ where: { land_id } });
      if (existingLand) {
        throw new Error('Land ID already exists');
      }
    }

    // Validate owner_id
    if (owner_id && owner_id !== landRecord.owner_id) {
      const owner = await User.findByPk(owner_id);
      if (!owner) {
        throw new Error('Owner not found');
      }
    }

    // Validate administrative_unit_id
    if (administrative_unit_id && administrative_unit_id !== landRecord.administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id);
      if (!adminUnit) {
        throw new Error('Administrative unit not found');
      }
    }

    // Validate registered_by
    if (registered_by && registered_by !== landRecord.registered_by) {
      const registrar = await User.findByPk(registered_by);
      if (!registrar) {
        throw new Error('Registrar not found');
      }
    }

    // Validate approved_by
    if (approved_by && approved_by !== landRecord.approved_by) {
      const approver = await User.findByPk(approved_by);
      if (!approver) {
        throw new Error('Approver not found');
      }
    }

    await landRecord.update({
      land_id, owner_id, administrative_unit_id, area, height, width, land_use, ownership_type,
      north_neighbor, south_neighbor, east_neighbor, west_neighbor, address, coordinates,
      registration_date, status, registered_by, approved_by, zoning_code
    });
    return landRecord;
  } catch (error) {
    throw new Error(`Failed to update land record: ${error.message}`);
  }
};

exports.deleteLandRecordService = async (id) => {
  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  if (!LandRecord) {
    throw new Error('LandRecord model is not defined');
  }
  try {
    const landRecord = await LandRecord.findByPk(id);
    if (!landRecord) {
      throw new Error('Land record not found');
    }
    await landRecord.destroy();
    return { message: 'Land record deleted successfully' };
  } catch (error) {
    throw new Error(`Failed to delete land record: ${error.message}`);
  }
};

