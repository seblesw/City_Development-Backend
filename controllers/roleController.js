const { createRoleService, getAllRolesService, getRoleByIdService, updateRoleService, deleteRoleService } = require("../services/roleService");

exports.createRole = async (req, res) => {
  try {
    const roleData = req.body;
    const role = await createRoleService(roleData);
    res.status(201).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
exports.getAllRoles = async (req, res) => {
  try {
    const roles = await getAllRolesService();
    const numberOfRoles = roles.length;
    res.status(200).json({
      numberOfRoles,
      status: "success",
      data: roles,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};
exports.getRoleById = async (req, res) => {
  try {
    const role = await getRoleByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message,
    });
  }
};
exports.updateRole = async (req, res) => {
  try {
    const role = await updateRoleService(req.params.id, req.body);
    res.status(200).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
exports.deleteRole = async (req, res) => {
  try {
    await deleteRoleService(req.params.id);
    res.status(204).json({
      status: "success",
      message: "Role deleted successfully",
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message,
    });
  }
};
