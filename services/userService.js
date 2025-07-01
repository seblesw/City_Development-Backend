const { User, Role, AdministrativeUnit } = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerUserService = async (userData, options = {}) => {
  const transaction = options.transaction || await User.sequelize.transaction();
  try {
    const {
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
      is_active,
      co_owners,
    } = userData;

    // Validate required fields for all users
    if (!first_name || !last_name || !national_id || !gender || !marital_status || !administrative_unit_id) {
      throw new Error("የግዴታ መረጃዎች (ስም, የአባት ስም, ብሔራዊ መታወቂያ, ጾታ, የጋብቻ ሁኔታ, አስተዳደራዊ ክፍል) መግለጽ አለባቸው።");
    }

    // Validate administrative unit
    const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id, { transaction });
    if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");

    // Validate role if provided
    if (role_id) {
      const role = await Role.findByPk(role_id, { transaction });
      if (!role || !["መዝጋቢ", "ማናጀር"].includes(role.name)) throw new Error("ትክክለኛ ሚና ይምረጡ (መዝጋቢ ወይም ማናጀር)።");
    }

    // Validate primary owner and co-owner logic
    if (primary_owner_id) {
      const primaryOwner = await User.findByPk(primary_owner_id, { transaction });
      if (!primaryOwner || primaryOwner.primary_owner_id !== null) throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
      if (primaryOwner.marital_status === "ነጠላ") throw new Error("ዋና ባለቤት ነጠላ ስለሆነ የጋራ ባለቤት መጨመር አይችልም።");
      if (!relationship_type) throw new Error("የጋራ ባለቤቶች የግንኙነት አይነት መግለጥ አለባቸው።");
    } else if (!email && !phone_number) {
      throw new Error("ኢሜይል ወይም ስልክ ቁጥር ከነዚህ ውስጥ አንዱ መግባት አለበት ለዋና ተጠቃሚ።");
    }

    // Validate marital status and co-owners
    if (!["ነጠላ", "ባለትዳር", "ቤተሰብ", "የጋራ ባለቤትነት"].includes(marital_status)) {
      throw new Error("የጋብቻ ሁኔታ ከተፈቀዱት እሴቶች (ነጠላ, ባለትዳር, ቤተሰብ, የጋራ ባለቤትነት) ውስጥ አንዱ መሆን አለበት።");
    }
    if (marital_status !== "ነጠላ" && (!co_owners || !Array.isArray(co_owners) || co_owners.length === 0)) {
      throw new Error("ለነጠላ ያልሆኑ ተጠቃሚዎች የጋራ ባለቤት መረጃ መግለጽ አለበት።");
    }

    // Set default password for primary users, null for co-owners
    const password = primary_owner_id ? null : await bcrypt.hash("12345678", 10);

    // Create primary user
    const user = await User.create(
      {
        first_name,
        last_name,
        email: email || null,
        phone_number: phone_number || null,
        password,
        role_id: role_id || null,
        administrative_unit_id,
        oversight_office_id: oversight_office_id || null,
        national_id,
        address: address || null,
        gender,
        marital_status,
        relationship_type: relationship_type || null,
        primary_owner_id: primary_owner_id || null,
        is_active: is_active !== undefined ? is_active : true,
      },
      { transaction }
    );

    // Create co-owners if provided
    const coOwners = [];
    if (co_owners && Array.isArray(co_owners)) {
      for (const coOwnerData of co_owners) {
        if (!coOwnerData.first_name || !coOwnerData.last_name || !coOwnerData.national_id || !coOwnerData.gender || !coOwnerData.marital_status || !coOwnerData.relationship_type) {
          throw new Error("የጋራ ባለቤት መረጃዎች (ስም, የአባት ስም, ብሔራዊ መታወቂያ, ጾታ, የጋብቻ ሁኔታ, የግንኙነት አይነት) መግለጽ አለባቸው።");
        }
        const coOwner = await User.create(
          {
            first_name: coOwnerData.first_name,
            last_name: coOwnerData.last_name,
            national_id: coOwnerData.national_id,
            gender: coOwnerData.gender,
            marital_status: coOwnerData.marital_status,
            relationship_type: coOwnerData.relationship_type,
            administrative_unit_id: coOwnerData.administrative_unit_id || administrative_unit_id,
            primary_owner_id: user.id,
            email: null,
            phone_number: null,
            role_id: null,
            address: coOwnerData.address || null,
            is_active: true,
          },
          { transaction }
        );
        coOwners.push(coOwner);
      }
    }

    if (!options.transaction) await transaction.commit();
    return { primaryUser: user, coOwners };
  } catch (error) {
    if (!options.transaction) await transaction.rollback();
    throw new Error(`ተጠቃሚ መመዝገብ ስህተት: ${error.message}`);
  }
};

const loginUserService = async ({ email, phone_number, password }) => {
  const user = await User.findOne({
    where: { [email ? "email" : "phone_number"]: email || phone_number },
    include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
  if (!user.password) throw new Error("የይለፍ ቃል አልተገኘም።");
  const isValid = await user.validatePassword(password);
  if (!isValid) throw new Error("የተሳሳተ የይለፍ ቃል።");
  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "1d" });
  user.last_login = new Date();
  await user.save();
  return { user, token };
};

const getUserByIdService = async (id) => {
  const user = await User.findByPk(id, {
    attributes: { exclude: ["password"] },
    include: [
      { model: Role, as: "role", attributes: ["id", "name"] },
      { model: User, as: "coOwners", attributes: ["id", "first_name", "last_name", "national_id", "relationship_type"] },
      { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name", "national_id"] },
    ],
  });
  if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
  return user;
};

const getAllUsersService = async (query) => {
  const { role_id, administrative_unit_id, is_active } = query;
  const where = {};
  if (role_id) where.role_id = role_id;
  if (administrative_unit_id) where.administrative_unit_id = administrative_unit_id;
  if (is_active !== undefined) where.is_active = is_active === "true";
  return await User.findAll({
    where,
    attributes: { exclude: ["password"] },
    include: [
      { model: Role, as: "role", attributes: ["id", "name"] },
      { model: User, as: "coOwners", attributes: ["id", "first_name", "last_name", "national_id", "relationship_type"] },
      { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name", "national_id"] },
    ],
  });
};

const updateUserService = async (id, userData) => {
  const transaction = await User.sequelize.transaction();
  try {
    const user = await User.findByPk(id, { transaction });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");

    const {
      first_name,
      last_name,
      email,
      phone_number,
      password,
      role_id,
      administrative_unit_id,
      oversight_office_id,
      national_id,
      address,
      gender,
      marital_status,
      relationship_type,
      primary_owner_id,
      is_active,
    } = userData;

    if (administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(administrative_unit_id, { transaction });
      if (!adminUnit) throw new Error("ትክክለኛ አስተዳደራዊ ክፍል ይምረጡ።");
    }

    if (role_id) {
      const role = await Role.findByPk(role_id, { transaction });
      if (!role || !["መዝጋቢ", "ማናጀር"].includes(role.name)) throw new Error("ትክክለኛ ሚና ይምረጡ (መዝጋቢ ወይም ማናጀር)።");
    }

    if (primary_owner_id) {
      const primaryOwner = await User.findByPk(primary_owner_id, { transaction });
      if (!primaryOwner || primaryOwner.primary_owner_id !== null) throw new Error("ትክክለኛ ዋና ባለቤት ይምረጡ።");
      if (primaryOwner.marital_status === "ነጠላ") throw new Error("ዋና ባለቤት ነጠላ ስለሆነ የጋራ ባለቤት መጨመር አይችልም።");
      if (!relationship_type) throw new Error("የጋራ ባለቤቶች የግንኙነት አይነት መግለጥ አለባቸው።");
    }

    if (marital_status && marital_status !== "ነጠላ") {
      const coOwners = await User.findAll({ where: { primary_owner_id: id }, transaction });
      if (coOwners.length === 0) throw new Error("ለነጠላ ያልሆኑ ተጠቃሚዎች የጋራ ባለቤት መረጃ መግለጽ አለበት።");
    }

    const updateData = {
      first_name: first_name || user.first_name,
      last_name: last_name || user.last_name,
      email: email !== undefined ? email : user.email,
      phone_number: phone_number !== undefined ? phone_number : user.phone_number,
      password: password ? await bcrypt.hash(password, 10) : user.password,
      role_id: role_id !== undefined ? role_id : user.role_id,
      administrative_unit_id: administrative_unit_id || user.administrative_unit_id,
      oversight_office_id: oversight_office_id !== undefined ? oversight_office_id : user.oversight_office_id,
      national_id: national_id || user.national_id,
      address: address !== undefined ? address : user.address,
      gender: gender || user.gender,
      marital_status: marital_status || user.marital_status,
      relationship_type: relationship_type !== undefined ? relationship_type : user.relationship_type,
      primary_owner_id: primary_owner_id !== undefined ? primary_owner_id : user.primary_owner_id,
      is_active: is_active !== undefined ? is_active : user.is_active,
    };

    await user.update(updateData, { transaction });
    await transaction.commit();
    return user;
  } catch (error) {
    await transaction.rollback();
    throw new Error(`ተጠቃሚ ማዘመን ስህተት: ${error.message}`);
  }
};

const deleteUserService = async (id, deleterId) => {
  const transaction = await User.sequelize.transaction();
  try {
    const user = await User.findByPk(id, { transaction });
    if (!user) throw new Error("ተጠቃሚ አልተገኘም።");
    const deleter = await User.findByPk(deleterId, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!deleter || !["ማናጀር"].includes(deleter.role?.name)) {
      throw new Error("ተጠቃሚ መሰረዝ የሚችሉት ማናጀር ብቻ ናቸው።");
    }
    await user.destroy({ transaction });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw new Error(`ተጠቃሚ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  registerUserService,
  loginUserService,
  getUserByIdService,
  getAllUsersService,
  updateUserService,
  deleteUserService,
};