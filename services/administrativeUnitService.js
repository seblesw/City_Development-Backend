const { AdministrativeUnit } = require('../models');

exports.createAdministrativeUnitService = async (data) => {
  const { name, type, parent_id, code } = data;

  if (!type || !['Region', 'Zone','woreda', 'Regiopolitan', 'Kifle Ketema','Zone City', 'Woreda city', 'Meri','Newus','Tadagi'].includes(type)) {
    throw new Error('Invalid type; must be one of: Region, Zone City, Woreda city, Meri, Newus, Tadagi');
  }
  if (code && (code.length < 1 || code.length > 20)) {
    throw new Error('Code must be 1–20 characters if provided');
  }

  try {
    // Check for duplicate name within the same parent_id
    const existingUnit = await AdministrativeUnit.findOne({
      where: { name, parent_id: parent_id || null },
    });
    if (existingUnit) {
      throw new Error('this name already exists under the same parent');
    }

    // Check for duplicate code
    if (code) {
      const existingCode = await AdministrativeUnit.findOne({ where: { code } });
      if (existingCode) {
        throw new Error('Code must be unique');
      }
    }

    // Validate parent_id if provided
    if (parent_id) {
      const parent = await AdministrativeUnit.findByPk(parent_id);
      if (!parent) {unit
        throw new Error('Parent  not found');
      }
      // Ensure type hierarchy (e.g., Meri can't be parent of Region)
      const validHierarchy = {
        Region: ['Zone City', 'Regiopolitan', 'Woreda City'],
        'Zone City': ['Woreda city', 'Zone City'],
        'Regiopolitan': ['kifle ketema'],
        'Woreda city': ['Meri', 'Newus', 'Tadagi'],
        Meri: [],
        Newus: [],
        Tadagi: [],
      };
      if (!validHierarchy[parent.type].includes(type)) {
        throw new Error(`Invalid hierarchy: ${type} cannot be a child of ${parent.type}`);
      }
    }

    const unit = await AdministrativeUnit.create({ name, type, parent_id, code, });
    return unit;
  } catch (error) {
    throw new Error(`Failed to create administrative unit: ${error.message}`);
  }
};

exports.getAllAdministrativeUnitsService = async () => {
  if (!AdministrativeUnit) {
    throw new Error('AdministrativeUnit model is not defined');
  }
  try {
    const units = await AdministrativeUnit.findAll({
      order: [['name', 'ASC']],
    });
    return units;
  } catch (error) {
    throw new Error(`Failed to fetch administrative units: ${error.message}`);
  }
};

exports.getAdministrativeUnitByIdService = async (id) => {
  if (!AdministrativeUnit) {
    throw new Error('AdministrativeUnit model is not defined');
  }
  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  try {
    const unit = await AdministrativeUnit.findByPk(id, {
      include: [
        { model: AdministrativeUnit, as: 'parent', attributes: ['id', 'name', 'type'] },
        { model: AdministrativeUnit, as: 'children', attributes: ['id', 'name', 'type'] },
      ],
    });
    if (!unit) {
      throw new Error('Administrative unit not found');
    }
    return unit;
  } catch (error) {
    throw new Error(`Failed to fetch administrative unit: ${error.message}`);
  }
};

exports.updateAdministrativeUnitService = async (id, data) => {
  const { name, type, parent_id, code, } = data;
  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  if (name && (typeof name !== 'string' || name.length < 2 || name.length > 100)) {
    throw new Error('Name must be 2–100 characters if provided');
  }
  if (type && !['Region', 'Zone City', 'Woreda city', 'Meri', 'Newus', 'Tadagi'].includes(type)) {
    throw new Error('Invalid type; must be one of: Region, Zone City, Woreda city, Meri, Newus, Tadagi');
  }
  if (code && (code.length < 1 || code.length > 20)) {
    throw new Error('Code must be 1–20 characters if provided');
  }
  if (!AdministrativeUnit) {
    throw new Error('AdministrativeUnit model is not defined');
  }

  try {
    const unit = await AdministrativeUnit.findByPk(id);
    if (!unit) {
      throw new Error('Administrative unit not found');
    }

    // Check for duplicate name within the same parent_id
    if (name && name !== unit.name) {
      const existingUnit = await AdministrativeUnit.findOne({
        where: { name, parent_id: parent_id || unit.parent_id || null },
      });
      if (existingUnit) {
        throw new Error('Unit with this name already exists under the same parent');
      }
    }

    // Check for duplicate code
    if (code && code !== unit.code) {
      const existingCode = await AdministrativeUnit.findOne({ where: { code } });
      if (existingCode) {
        throw new Error('Code must be unique');
      }
    }

    // Validate parent_id if changed
    if (parent_id !== undefined && parent_id !== unit.parent_id) {
      if (parent_id) {
        const parent = await AdministrativeUnit.findByPk(parent_id);
        if (!parent) {
          throw new Error('Parent unit not found');
        }
        const validHierarchy = {
          Region: ['Zone City', 'Woreda city'],
          'Zone City': ['Woreda city', 'Meri'],
          'Woreda city': ['Meri', 'Newus'],
          Meri: ['Newus', 'Tadagi'],
          Newus: ['Tadagi'],
          Tadagi: [],
        };
        if (!validHierarchy[parent.type].includes(type || unit.type)) {
          throw new Error(`Invalid hierarchy: ${type || unit.type} cannot be a child of ${parent.type}`);
        }
      }
    }

    await unit.update({ name, type, parent_id, code, });
    return unit;
  } catch (error) {
    throw new Error(`Failed to update administrative unit: ${error.message}`);
  }
};

exports.deleteAdministrativeUnitService = async (id) => {
  if (!id || isNaN(parseInt(id))) {
    throw new Error('Invalid ID');
  }
  if (!AdministrativeUnit) {
    throw new Error('AdministrativeUnit model is not defined');
  }
  try {
    const unit = await AdministrativeUnit.findByPk(id);
    if (!unit) {
      throw new Error('Administrative unit not found');
    }
    // Check for children to prevent deletion of parent units
    const children = await AdministrativeUnit.findAll({ where: { parent_id: id } });
    if (children.length > 0) {
      throw new Error('Cannot delete unit with child administrative units');
    }
    await unit.destroy();
    return { message: 'Administrative unit deleted successfully' };
  } catch (error) {
    throw new Error(`Failed to delete administrative unit: ${error.message}`);
  }
};

