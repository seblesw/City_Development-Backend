const { sequelize, User, Role, AdministrativeUnit, OversightOffice } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const registerOfficial = async (data,  options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    if (!data.first_name || !data.last_name || !data.national_id || !data.administrative_unit_id || !data.role_id || !data.gender) {
      throw new Error("ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ የአስተዳደር ክፍል፣ ሚና፣ እና ጾታ መግለጽ አለባቸው።");
    }

    t = t || (await sequelize.transaction());

    // Validate creator role
    // const creator = await User.findByPk(creatorId, {
    //   include: [{ model: Role, as: "role" }],
    //   transaction: t,
    // });
    // if (!creator || !["አስተዳደር"].includes(creator.role?.name)) {
    //   throw new Error("ባለሥልጣን መመዝገብ የሚችሉት አስተዳደር ብቻ ናቸው።");
    // }

    // Validate administrative_unit_id
    const adminUnit = await AdministrativeUnit.findByPk(data.administrative_unit_id, { transaction: t });
    if (!adminUnit) {
      throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
    }

    // Validate oversight_office_id if provided
    if (data.oversight_office_id) {
      const office = await OversightOffice.findByPk(data.oversight_office_id, { transaction: t });
      if (!office) {
        throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ።");
      }
    }

    // Validate role_id
    const role = await Role.findByPk(data.role_id, { transaction: t });
    if (!role || !["መዝጋቢ", "አስተዳደር"].includes(role.name)) {
      throw new Error("ትክክለኛ ሚና ይምረጡ (መዝጋቢ ወይም አስተዳደር)።");
    }

    // Validate email uniqueness if provided
    if (data.email) {
      const existingEmail = await User.findOne({
        where: { email: data.email, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingEmail) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate phone_number uniqueness if provided
    if (data.phone_number) {
      const existingPhone = await User.findOne({
        where: { phone_number: data.phone_number, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingPhone) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate national_id uniqueness
    const existingNationalId = await User.findOne({
      where: { national_id: data.national_id, deletedAt: { [Op.eq]: null } },
      transaction: t,
    });
    if (existingNationalId) {
      throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
    }

    // Create official
    const official = await User.create(
      {
        ...data,
        password: await bcrypt.hash(data.password, 10),
      },
      { transaction: t }
    );

    if (!transaction) await t.commit();
    return official;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ባለሥልጣን መፍጠር ስህተት: ${error.message}`);
  }
};

const login = async ({ email, phone_number, password }, options = {}) => {
  const { transaction } = options;
  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone_number }],
        deletedAt: { [Op.eq]: null },
      },
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!user) {
      throw new Error("ተጠቃሚ አልተገኘም።");
    }
    if (!user.password || !(await user.validatePassword(password))) {
      throw new Error("የተሳሳተ የይለፍ ቃል።");
    }
    if (!user.is_active) {
      throw new Error("ተጠቃሚው ንቁ አይደለም።");
    }

    // Update last_login
    await user.update({ last_login: new Date() }, { transaction });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role?.name },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1h" }
    );

    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role_id: user.role_id,
        administrative_unit_id: user.administrative_unit_id,
        oversight_office_id: user.oversight_office_id,
        national_id: user.national_id,
        is_active: user.is_active,
        last_login: user.last_login,
      },
      token,
    };
  } catch (error) {
    throw new Error(`መግባት ስህተት: ${error.message}`);
  }
};

module.exports = {
  registerOfficial,
  login,
};