const {
  createRoleService,
  getAllRolesService,
  getRoleByIdService,
  updateRoleService,
  deleteRoleService,
} = require("../services/roleService");

const createRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const role = await createRoleService({ name, permissions });
    res.status(201).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ሚና መፍጠር አልተሳካም።",
    });
  }
};

const getAllRoles = async (req, res) => {
  try {
    const roles = await getAllRolesService();
    const numberOfRoles = roles.length;
    res.status(200).json({
      status: "success",
      numberOfRoles,
      data: roles,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ሚናዎችን ማግኘት አልተሳካም።",
    });
  }
};

const getRoleById = async (req, res) => {
  try {
    const role = await getRoleByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ሚና አልተገኘም።",
    });
  }
};

const updateRole = async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const role = await updateRoleService(req.params.id, { name, permissions });
    res.status(200).json({
      status: "success",
      data: role,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ሚና ማዘመን አልተሳካም።",
    });
  }
};

const deleteRole = async (req, res) => {
  try {
    await deleteRoleService(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "ሚና መሰረዝ አልተሳካም።",
    });
  }
};
module.exports = {
  createRole,
  getAllRoles,
  getRoleById,
  updateRole,
  deleteRole,
};