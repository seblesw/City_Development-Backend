const {
  createRoleService,
  getAllRolesService,
  getRoleByIdService,
  updateRoleService,
  deleteRoleService,
} = require('../services/roleService');

exports.createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const userId = req.user.id; // Assumes authenticated admin
    const role = await createRoleService({ name, permissions }, userId);
    res.status(201).json({
      status: 'success',
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ሚና መፍጠር አልተሳካም።',
    });
  }
};

exports.getAllRoles = async (req, res) => {
  try {
    const roles = await getAllRolesService();
    const numberOfRoles = roles.length;
    res.status(200).json({
      status: 'success',
      numberOfRoles,
      data: roles,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ሚናዎችን ማግኘቤት አልተሳካም።',
    });
  }
};

exports.getRoleById = async (req, res) => {
  try {
    const role = await getRoleByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: role,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ሚና አልተገኘም።',
    });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const userId = req.user.id;
    const role = await updateRoleService(req.params.id, { name, permissions }, userId);
    res.status(200).json({
      status: 'success',
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ሚና ማዘመን አልተሳካም።',
    });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteRoleService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ሚና መሰረዝ አልተሳካም።',
    });
  }
};