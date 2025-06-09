const  Region  = require('../models');

const createRegionService = async (data) => {
  const { name, code } = data;
  try {
    const existingRegion = await Region.findOne({ where: { name } });
    if (existingRegion) {
      throw new Error('Region with this name already exists');
    }
    if (code) {
      const existingCode = await Region.findOne({ where: { code } });
      if (existingCode) {
        throw new Error('Region code must be unique');
      }
    }
    const region = await Region.create({ name, code });
    return region;
  } catch (error) {
    throw new Error(`Failed to create region: ${error.message}`);
  }
};

const getAllRegionsService = async () => {
  try {
    const regions = await Region.findAll();
    return regions;
  } catch (error) {
    throw new Error(`Failed to fetch regions: ${error.message}`);
  }
};

const getRegionByIdService = async (id) => {
  try {
    const region = await Region.findByPk(id);
    if (!region) {
      throw new Error('Region not found');
    }
    return region;
  } catch (error) {
    throw new Error(`Failed to fetch region: ${error.message}`);
  }
};

const updateRegionService = async (id, data) => {
  const { name, code } = data;
  try {
    const region = await Region.findByPk(id);
    if (!region) {
      throw new Error('Region not found');
    }
    if (name && name !== region.name) {
      const existingRegion = await Region.findOne({ where: { name } });
      if (existingRegion) {
        throw new Error('Region with this name already exists');
      }
    }
    if (code && code !== region.code) {
      const existingCode = await Region.findOne({ where: { code } });
      if (existingCode) {
        throw new Error('Region code must be unique');
      }
    }
    await region.update({ name, code });
    return region;
  } catch (error) {
    throw new Error(`Failed to update region: ${error.message}`);
  }
};

const deleteRegionService = async (id) => {
  try {
    const region = await Region.findByPk(id);
    if (!region) {
      throw new Error('Region not found');
    }
    await region.destroy();
    return { message: 'Region deleted successfully' };
  } catch (error) {
    throw new Error(`Failed to delete region: ${error.message}`);
  }
};

module.exports = {
  createRegionService,
  getAllRegionsService,
  getRegionByIdService,
  updateRegionService,
  deleteRegionService,
};