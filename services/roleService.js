const { Role } = require("../models");

exports.createRoleService = async (data) => {
  return await Role.create(data);
};

exports.getRoleByIdService = async (id) => {
  const role = await Role.findByPk(id);
  if (!role) throw new Error("ሚና አልተገኘም።");
  return role;
};

exports.getAllRolesService = async () => {
  return await Role.findAll({
    order: [["createdAt", "DESC"]],
  });
};

exports.updateRoleService = async (id, data) => {
  const role = await Role.findByPk(id);
  if (!role) throw new Error("ሚና አልተገኘም።");
  return await role.update(data);
};

exports.deleteRoleService = async (id) => {
  const role = await Role.findByPk(id);
  if (!role) throw new Error("ሚና አልተገኘም።");
  if (role.name === "ተጠቃሚ") throw new Error("ነባሪ ሚና 'ተጠቃሚ' መሰረዝ አይችልም።");
  return await role.destroy();
};
