const { Role } = require('../models'); 

exports.createRoleService = async (data) => {
    try {
        const { name, permisions } = data;
        if (!name || !permisions) {
        throw new Error('All fields are required');
        }
        if (!Role) {
        throw new Error('Role model is not defined');
        }
        const existingRole = await Role.findOne({ where: { name } });
        if (existingRole) {
        throw new Error('Role with this name already exists');
        }
        const role = await Role.create({
        name,
        permisions,
        });
        return role;
    } catch (error) {
        throw new Error(`Failed to create role: ${error.message}`);
    }
    }

exports.getAllRolesService = async () => {
    try {
        if (!Role) {
            throw new Error('Role model is not defined');
        }
        const roles = await Role.findAll();
        return roles;
    } catch (error) {
        throw new Error(`Failed to fetch roles: ${error.message}`);
    }
}

exports.getRoleByIdService = async (id) => {
    try {
        if (!Role) {
            throw new Error('Role model is not defined');
        }
        const role = await Role.findByPk(id);
        if (!role) {
            throw new Error('Role not found');
        }
        return role;
    } catch (error) {
        throw new Error(`Failed to fetch role: ${error.message}`);
    }
}

exports.updateRoleService = async (id, data) => {
    try {
        const { name, permisions } = data;
        if (!name || !permisions) {
            throw new Error('All fields are required');
        }
        if (!Role) {
            throw new Error('Role model is not defined');
        }
        const role = await Role.findByPk(id);
        if (!role) {
            throw new Error('Role not found');
        }
        role.name = name;
        role.permisions = permisions;
        await role.save();
        return role;
    } catch (error) {
        throw new Error(`Failed to update role: ${error.message}`);
    }
}
exports.deleteRoleService = async (id) => {
    try {
        if (!Role) {
            throw new Error('Role model is not defined');
        }
        const role = await Role.findByPk(id);
        if (!role) {
            throw new Error('Role not found');
        }
        await role.destroy();
    } catch (error) {
        throw new Error(`Failed to delete role: ${error.message}`);
    }
}

