const {Region}  = require('../models');

exports.createRegionService = async (data) => {
  const { name, code } = data;
  if (!Region) {
    throw new Error('Region model is not defined');
  }
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

exports.getAllRegionsService = async () => {
  if (!Region) {
    throw new Error('Region model is not defined');
  }
  try {
    const regions = await Region.findAll();
    return regions;
  } catch (error) {
    throw new Error(`Failed to fetch regions: ${error.message}`);
  }
};

exports.getRegionByIdService = async (id) => {
  if (!Region) {
    throw new Error('Region model is not defined');
  }
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

exports.updateRegionService = async (id, data) => {
  const { name, code } = data;
  if (!Region) {
    throw new Error('Region model is not defined');
  }
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

exports.deleteRegionService = async (id) => {
  if (!Region) {
    throw new Error('Region model is not defined');
  }
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

