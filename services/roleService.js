const { Op } = require("sequelize");
const { Role, User } = require("../models");

exports.createRoleService = async (data, userId, transaction) => {
  const { name, permissions } = data;
  try {
    const existingRole = await Role.findOne({
      where: { name, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (existingRole) throw new Error("ይህ ሚና ስም ቀደም ሲል ተመዝግቧል።");

    return await Role.create(
      { name, permissions, created_by: userId },
      { transaction }
    );
  } catch (error) {
    throw new Error(error.message || "ሚና መፍጠር አልተሳካም።");
  }
};

exports.getAllRolesService = async () => {
  try {
    return await Role.findAll({
      where: { deleted_at: { [Op.eq]: null } },
      include: [
        { model: User, as: "creator", attributes: ["id", "first_name", "last_name"] },
        { model: User, as: "updater", attributes: ["id", "first_name", "last_name"], required: false },
      ],
    });
  } catch (error) {
    throw new Error(error.message || "ሚናዎችን ማግኘቤት አልተሳካም።");
  }
};

exports.getRoleByIdService = async (id) => {
  try {
    const role = await Role.findByPk(id, {
      include: [
        { model: User, as: "creator", attributes: ["id", "first_name", "last_name"] },
        { model: User, as: "updater", attributes: ["id", "first_name", "last_name"], required: false },
      ],
    });
    if (!role) throw new Error("ሚና አልተገኘም።");
    return role;
  } catch (error) {
    throw new Error(error.message || "ሚና ማግኘቤት አልተሳካም።");
  }
};

exports.updateRoleService = async (id, data, userId, transaction) => {
  const { name, permissions } = data;
  try {
    const role = await Role.findByPk(id, { transaction });
    if (!role) throw new Error("ሚና አልተገኘም።");

    if (name && name !== role.name) {
      const existingRole = await Role.findOne({
        where: { name, deleted_at: { [Op.eq]: null } },
        transaction,
      });
      if (existingRole) throw new Error("ይህ ሚና ስም ቀደም ሲል ተመዝግቧል።");
    }

    await role.update(
      { name, permissions, updated_by: userId },
      { transaction }
    );
    return await Role.findByPk(id, {
      include: [
        { model: User, as: "creator", attributes: ["id", "first_name", "last_name"] },
        { model: User, as: "updater", attributes: ["id", "first_name", "last_name"], required: false },
      ],
      transaction,
    });
  } catch (error) {
    throw new Error(error.message || "ሚና ማዘመን አልተሳካም።");
  }
};

exports.deleteRoleService = async (id, userId, transaction) => {
  try {
    const role = await Role.findByPk(id, { transaction });
    if (!role) throw new Error("ሚና አልተገኘም።");
    if (role.name === "ተጠቃሚ") throw new Error("ነባሪ ሚና 'ተጠቃሚ' መሰረዝ አይችልም።");

    // Check if role is assigned to users
    const usersWithRole = await User.findOne({
      where: { role_id: id, deleted_at: { [Op.eq]: null } },
      transaction,
    });
    if (usersWithRole) throw new Error("ይህ ሚና ለተጠቃሚዎች ተመድቧል፣ መሰረዝ አይችልም።");

    await role.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ሚና መሰረዝ አልተሳካም።");
  }
};