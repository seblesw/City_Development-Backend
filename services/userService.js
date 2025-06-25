const { Op } = require("sequelize");
const { User } = require("../models");
const jwt = require("jsonwebtoken");

exports.registerUserService = async (data) => {
  console.log("Registering user with data:", data);
  if (!User.create) throw new Error("User.create is undefined at runtime in registerUserService");
  const user = await User.create(data);
  return user;
};

exports.loginUserService = async ({ email, phone_number, password }) => {
  if (!User.findOne) throw new Error("User.findOne is undefined at runtime in loginUserService");
  const user = await User.findOne({
    where: {
      [Op.or]: [{ email }, { phone_number }],
      deleted_at: { [Op.eq]: null },
      is_active: true,
    },
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም ወይም እንቅስቃሴ-አልባ ነው።");
  const isValid = await user.validatePassword(password);
  if (!isValid) throw new Error("የተሳሳተ የይለፍ ቃል።");
  await user.update({ last_login: new Date() });
  const token = jwt.sign({ id: user.id, email: user.email, phone_number: user.phone_number }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  return { user, token };
};

exports.getUserByIdService = async (id) => {
  const user = await User.findByPk(id, {
    where: { deleted_at: { [Op.eq]: null } },
    include: [{ model: User, as: "coOwners" }],
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
  return user;
};

exports.getAllUsersService = async (filters = {}) => {
  return await User.findAll({
    where: { ...filters, deleted_at: { [Op.eq]: null } },
    include: [{ model: User, as: "coOwners" }],
    order: [["createdAt", "DESC"]],
  });
};

exports.updateUserService = async (id, data) => {
  const user = await User.findByPk(id, {
    where: { deleted_at: { [Op.eq]: null } },
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
  return await user.update(data);
};

exports.deleteUserService = async (id) => {
  const user = await User.findByPk(id, {
    where: { deleted_at: { [Op.eq]: null } },
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
  return await user.destroy();
};