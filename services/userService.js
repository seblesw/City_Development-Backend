const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const { User, Role, AdministrativeUnit, OversightOffice } = require("../models");

exports.registerUserService = async (data, userId, transaction) => {
  const { first_name, last_name, email, phone_number, role_id, administrative_unit_id, oversight_office_id, national_id, address, gender, marital_status, relationship_type, primary_owner_id } = data;
  try {
    // Validate administrative_unit_id
    const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id, { transaction });
    if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

    // Validate oversight_office_id if provided
    if (role_id && oversight_office_id) {
      const office = await OversightOffice.findByPk(oversight_office_id, { transaction });
      if (!office) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
      if (office.administrative_unit_id !== administrative_unit_id) {
        throw new Error("ቢሮው ከተመረጠው አስተዳደራዊ ክፍል ጋር መዛመድ አለበት።");
      }
    }

    // Validate role_id if provided
    if (role_id) {
      const role = await Role.findByPk(role_id, { transaction });
      if (!role) throw new Error("ትክክለኛ ሚና ይምረጡ።");
    }

    // Validate primary_owner_id for co-owners
    if (primary_owner_id) {
      const primaryOwner = await User.findByPk(primary_owner_id, { transaction });
      if (!primaryOwner || primaryOwner.primary_owner_id !== null) {
        throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
      }
      if (marital_status === "ነጠላ") {
        throw new Error("ነጠላ የጋብቻ ሁኔታ ያለባቸው ተጠቃሚዎች የጋራ ባለቤት መኖር አይችልም።");
      }
    }

    // Create user
    const user = await User.create(
      {
        first_name,
        last_name,
        email,
        phone_number,
        role_id,
        administrative_unit_id,
        oversight_office_id,
        national_id,
        address,
        gender,
        marital_status,
        relationship_type,
        primary_owner_id,
        created_by: userId,
      },
      { transaction }
    );

    return user;
  } catch (error) {
    throw new Error(error.message || "ተጠቃሚ መፍጠር አልተሳካም።");
  }
};

exports.loginUserService = async ({ email, phone_number, password }) => {
  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone_number }],
        deleted_at: { [Op.eq]: null },
      },
    });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
    if (!user.password) throw new Error("ይህ ተጠቃሚ መግባት አይችልም።");
    const isValid = await user.validatePassword(password);
    if (!isValid) throw new Error("የተሳሳተ የይለፍ ቃል።");

    const token = jwt.sign(
      { id: user.id, role_id: user.role_id, administrative_unit_id: user.administrative_unit_id, oversight_office_id: user.oversight_office_id },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    await user.update({ last_login: new Date() });
    return { user, token };
  } catch (error) {
    throw new Error(error.message || "መግባት አልተሳካም።");
  }
};

exports.getAllUsersService = async (administrativeUnitId, oversightOfficeId) => {
  try {
    const where = { deleted_at: { [Op.eq]: null } };
    if (administrativeUnitId) where.administrative_unit_id = administrativeUnitId;
    if (oversightOfficeId) where.oversight_office_id = oversightOfficeId;
    return await User.findAll({
      where,
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: OversightOffice, as: "oversightOffice", attributes: ["id", "name"], required: false },
        { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"], required: false },
      ],
    });
  } catch (error) {
    throw new Error(error.message || "ተጠቃሚዎችን ማግኘት አልተሳካም።");
  }
};

exports.getUserByIdService = async (id) => {
  try {
    const user = await User.findByPk(id, {
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: OversightOffice, as: "oversightOffice", attributes: ["id", "name"], required: false },
        { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"], required: false },
      ],
    });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
    return user;
  } catch (error) {
    throw new Error(error.message || "ተጠቃሚ ማግኘት አልተሳካም።");
  }
};

exports.updateUserService = async (id, data, userId, transaction) => {
  const { first_name, last_name, email, phone_number, role_id, administrative_unit_id, oversight_office_id, national_id, address, gender, marital_status, relationship_type, primary_owner_id } = data;
  try {
    const user = await User.findByPk(id, { transaction });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");

    // Validate administrative_unit_id
    if (administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id, { transaction });
      if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
    }

    // Validate oversight_office_id if provided
    if (role_id && oversight_office_id) {
      const office = await OversightOffice.findByPk(oversight_office_id, { transaction });
      if (!office) throw new Error("ትክክለኛ ቢሮ ይምረጡ።");
      if (office.administrative_unit_id !== (administrative_unit_id || user.administrative_unit_id)) {
        throw new Error("ቢሮው ከተመረጠው አስተዳደራዊ ክፍል ጋር መዛመድ አለበት።");
      }
    }

    // Validate role_id if provided
    if (role_id) {
      const role = await Role.findByPk(role_id, { transaction });
      if (!role) throw new Error("ትክክለኛ ሚና ይምረጡ።");
    }

    // Validate primary_owner_id for co-owners
    if (primary_owner_id && primary_owner_id !== user.primary_owner_id) {
      const primaryOwner = await User.findByPk(primary_owner_id, { transaction });
      if (!primaryOwner || primaryOwner.primary_owner_id !== null) {
        throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
      }
      if (marital_status === "ነጠላ") {
        throw new Error("ነጠላ የጋብቻ ሁኔታ ያለባቸው ተጠቃሚዎች የጋራ ባለቤት መኖር አይችልም።");
      }
    }

    await user.update(
      {
        first_name,
        last_name,
        email,
        phone_number,
        role_id,
        administrative_unit_id,
        oversight_office_id,
        national_id,
        address,
        gender,
        marital_status,
        relationship_type,
        primary_owner_id,
        updated_by: userId,
      },
      { transaction }
    );
    return await User.findByPk(id, {
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: OversightOffice, as: "oversightOffice", attributes: ["id", "name"], required: false },
        { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"], required: false },
      ],
      transaction,
    });
  } catch (error) {
    throw new Error(error.message || "ተጠቃሚ ማዘመን አልተሳካም።");
  }
};

exports.deleteUserService = async (id, userId, transaction) => {
  try {
    const user = await User.findByPk(id, { transaction });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
    await user.destroy({ transaction });
  } catch (error) {
    throw new Error(error.message || "ተጠቃሚ መሰረዝ አልተሳካም።");
  }
};