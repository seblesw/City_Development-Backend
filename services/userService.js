const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
const {
  User,
  Role,
  AdministrativeUnit,
  OversightOffice,
} = require("../models");

const registerUserService = async (userData, createdByUserId) => {
  const {
    first_name,
    last_name,
    email,
    phone_number,
    password,
    role_id,
    administrative_unit_id,
    oversight_office_id,
  } = userData;

  const existingUser = await User.findOne({
    where: {
      [Op.or]: [{ email }, { phone_number }],
      deleted_at: null,
    },
  });
  if (existingUser) {
    throw new Error("ኢሜል ወይም ስልክ ቁጥር ተይዟል።");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    first_name,
    last_name,
    email,
    phone_number,
    password: hashedPassword,
    role_id,
    administrative_unit_id,
    oversight_office_id,
    created_by: createdByUserId,
  });

  return User.findByPk(user.id, {
    attributes: { exclude: ["password", "deleted_at"] },
    include: [
      { model: Role, as: "role" },
      { model: AdministrativeUnit, as: "administrativeUnit" },
      { model: OversightOffice, as: "oversightOffice" },
    ],
  });
};

const loginUserService = async ({ email, phone_number, password }) => {
  const user = await User.findOne({
    where: {
      [Op.or]: [{ email }, { phone_number }],
      deleted_at: null,
    },
    include: [
      { model: Role, as: "role" },
      { model: AdministrativeUnit, as: "administrativeUnit" },
      { model: OversightOffice, as: "oversightOffice" },
    ],
  });

  if (!user) {
    throw new Error("ተጠቃሚ አልተገኘም።");
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error("የተሳሳተ የይለፍ ቃል።");
  }

  const token = jwt.sign(
    { id: user.id, role_id: user.role_id },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  return {
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      administrativeUnit: user.administrativeUnit,
    },
    token,
  };
};

const getAllUsersService = async (administrativeUnitId, oversightOfficeId) => {
  const where = { deleted_at: null };
  if (administrativeUnitId) {
    where.administrative_unit_id = administrativeUnitId;
  }
  if (oversightOfficeId) {
    const adminUnits = await AdministrativeUnit.findAll({
      where: { oversight_office_id: oversightOfficeId, deleted_at: null },
      attributes: ["id"],
    });
    where.administrative_unit_id = adminUnits.map((unit) => unit.id);
  }

  return User.findAll({
    where,
    attributes: { exclude: ["password", "deleted_at"] },
    include: [
      { model: Role, as: "role" },
      { model: AdministrativeUnit, as: "administrativeUnit" },
      { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"] },
      { model: User, as: "coOwners", attributes: ["id", "first_name", "last_name"] },
    ],
    order: [["created_at", "DESC"]],
  });
};

const getUserByIdService = async (id) => {
  const user = await User.findByPk(id, {
    where: { deleted_at: null },
    attributes: { exclude: ["password", "deleted_at"] },
    include: [
      { model: Role, as: "role" },
      { model: AdministrativeUnit, as: "administrativeUnit" },
      { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"] },
      { model: User, as: "coOwners", attributes: ["id", "first_name", "last_name"] },
    ],
  });

  if (!user) {
    throw new Error("ተጠቃሚ አልተገኘም።");
  }

  return user;
};

const updateUserService = async (id, userData, updatedByUserId) => {
  const user = await User.findByPk(id, { where: { deleted_at: null } });
  if (!user) {
    throw new Error("ተጠቃሚ አልተገኘም።");
  }

  const {
    first_name,
    last_name,
    email,
    phone_number,
    password,
    role_id,
    administrative_unit_id,
  } = userData;

  if (email || phone_number) {
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone_number }],
        id: { [Op.ne]: id },
        deleted_at: null,
      },
    });
    if (existingUser) {
      throw new Error("ኢሜል ወይም ስልክ ቁጥር ተይዟል።");
    }
  }

  const updateData = {
    first_name,
    last_name,
    email,
    phone_number,
    role_id,
    administrative_unit_id,
    updated_by: updatedByUserId,
  };

  if (password) {
    updateData.password = await bcrypt.hash(password, 10);
  }

  await user.update(updateData);

  return User.findByPk(id, {
    attributes: { exclude: ["password", "deleted_at"] },
    include: [
      { model: Role, as: "role" },
      { model: AdministrativeUnit, as: "administrativeUnit" },
      { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"] },
      { model: User, as: "coOwners", attributes: ["id", "first_name", "last_name"] },
    ],
  });
};

const deleteUserService = async (id, deletedByUserId) => {
  const user = await User.findByPk(id, { where: { deleted_at: null } });
  if (!user) {
    throw new Error("ተጠቃሚ አልተገኘም።");
  }

  await user.update({ deleted_at: new Date(), deleted_by: deletedByUserId });
};

module.exports = {
  registerUserService,
  loginUserService,
  getAllUsersService,
  getUserByIdService,
  updateUserService,
  deleteUserService,
};