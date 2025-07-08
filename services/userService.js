const { sequelize, User, Role, AdministrativeUnit, OversightOffice } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const createLandOwner = async (primaryOwnerData, coOwnersData, creatorId, options = {}) => {
  const { transaction } = options;
  const t = transaction || await sequelize.transaction();

  try {
    const requiredFields = [
      "first_name", "middle_name", "last_name", "national_id",
      "gender", "marital_status", "ownership_category", "administrative_unit_id"
    ];

    for (const field of requiredFields) {
      if (!primaryOwnerData[field]) {
        throw new Error(`እባክዎ የመሬት ባለቤት ${field} ያስገቡ።`);
      }
    }

    // Check ownership category validity
    if (!["የግል", "የጋራ"].includes(primaryOwnerData.ownership_category)) {
      throw new Error("የባለቤትነት ክፍል የግል ወይም የጋራ መሆን አለበት።");
    }

    // Create or update primary owner
    let primaryOwner = await User.findOne({
      where: {
        national_id: primaryOwnerData.national_id,
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });

    if (primaryOwner) {
      await primaryOwner.update({
        ...primaryOwnerData,
        updated_by: creatorId,
      }, { transaction: t });
    } else {
      primaryOwner = await User.create({
        ...primaryOwnerData,
        password: primaryOwnerData.password
          ? await bcrypt.hash(primaryOwnerData.password, 10)
          : null,
        role_id: null,
        oversight_office_id: null,
        primary_owner_id: null,
        relationship_type: null,
        created_by: creatorId,
        is_active: true,
      }, { transaction: t });
    }

    const coOwners = [];

    // Co-owners only for የጋራ
    if (primaryOwnerData.ownership_category === "የጋራ") {
      if (!coOwnersData.length) {
        throw new Error("የጋራ ባለቤትነት ሲሆን ተጋሪ ባለቤቶችን ያስገቡ።");
      }

      for (const co of coOwnersData) {
        const required = ["first_name", "middle_name", "last_name", "relationship_type"];
        for (const field of required) {
          if (!co[field]) {
            throw new Error(`በተጋሪ ባለቤት መረጃ ውስጥ ${field} አልተሞላም።`);
          }
        }

        const coOwner = await User.create({
          first_name: co.first_name,
          middle_name: co.middle_name,
          last_name: co.last_name,
          phone_number: co.phone_number || null,
          relationship_type: co.relationship_type,
          primary_owner_id: primaryOwner.id,
          administrative_unit_id: primaryOwner.administrative_unit_id,
          created_by: creatorId,
          is_active: true,
        }, { transaction: t });

        coOwners.push(coOwner);
      }

    } else if (coOwnersData.length > 0) {
      throw new Error("የግል ባለቤትነት ሲሆን ተጋሪ ባለቤት መረጃ መስጠት አይቻልም።");
    }

    if (!transaction) await t.commit();

    return { primaryOwner, coOwners };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ባለቤት መፍጠር ስህተት: ${error.message}`);
  }
};


const getAllUserService = async (options = {}) => {
  const { transaction } = options;
  try {
    const users = await User.findAll({  
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: OversightOffice, as: "oversightOffice", attributes: ["id", "name"] },
      ],
      attributes: [
        "id", 
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "role_id",
        "administrative_unit_id",
        "oversight_office_id",
        "national_id",
        "address",
        "is_active",
        "last_login",
      ],
      where: { deletedAt: { [Op.eq]: null } },
      order: [["createdAt", "DESC"]],
      transaction,
    });
    return users;
  } catch (error) {
    throw new Error(`ተጠቃሚዎችን ማግኘት ስህተት: ${error.message}`);
  }
};
        

const getUserById = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const user = await User.findByPk(id, {
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        { model: AdministrativeUnit, as: "administrativeUnit", attributes: ["id", "name"] },
        { model: OversightOffice, as: "oversightOffice", attributes: ["id", "name"] },
        { model: User, as: "primaryOwner", attributes: ["id", "first_name", "last_name"] },
      ],
      attributes: [
        "id",
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "role_id",
        "administrative_unit_id",
        "oversight_office_id",
        "national_id",
        "address",
        "gender",
        "relationship_type",
        "marital_status",
        "primary_owner_id",
        "is_active",
        "last_login",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }
    return user;
  } catch (error) {
    throw new Error(`ተጠቃሚ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

const updateUser = async (id, data, updaterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate updater role
    const updater = await User.findByPk(updaterId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!updater || !["አስተዳደር"].includes(updater.role?.name)) {
      throw new Error("ተጠቃሚ መቀየር የሚችሉት አስተዳደር ብቻ ናቸው።");
    }

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    // Validate administrative_unit_id if changed
    if (data.administrative_unit_id && data.administrative_unit_id !== user.administrative_unit_id) {
      const adminUnit = await AdministrativeUnit.findByPk(data.administrative_unit_id, { transaction: t });
      if (!adminUnit) {
        throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
      }
    }

    // Validate oversight_office_id if changed
    if (data.oversight_office_id !== undefined && data.oversight_office_id !== user.oversight_office_id) {
      if (data.oversight_office_id) {
        const office = await OversightOffice.findByPk(data.oversight_office_id, { transaction: t });
        if (!office) {
          throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ።");
        }
      }
    }

    // Validate role_id if changed
    if (data.role_id !== undefined && data.role_id !== user.role_id) {
      if (data.role_id) {
        const role = await Role.findByPk(data.role_id, { transaction: t });
        if (!role) {
          throw new Error("ትክክለኛ ሚና ይምረጡ።");
        }
      }
    }

    // Validate email uniqueness if changed
    if (data.email && data.email !== user.email) {
      const existingEmail = await User.findOne({
        where: { email: data.email, id: { [Op.ne]: id }, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingEmail) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate phone_number uniqueness if changed
    if (data.phone_number && data.phone_number !== user.phone_number) {
      const existingPhone = await User.findOne({
        where: { phone_number: data.phone_number, id: { [Op.ne]: id }, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingPhone) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate national_id uniqueness if changed
    if (data.national_id && data.national_id !== user.national_id) {
      const existingNationalId = await User.findOne({
        where: { national_id: data.national_id, id: { [Op.ne]: id }, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingNationalId) {
        throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Prepare update data
    const updateData = {};
    const updatableFields = [
      "first_name",
      "last_name",
      "email",
      "phone_number",
      "password",
      "role_id",
      "administrative_unit_id",
      "oversight_office_id",
      "national_id",
      "address",
      "gender",
      "relationship_type",
      "marital_status",
      "primary_owner_id",
      "is_active",
    ];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }
    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    // Update user
    updateData.updated_at = new Date();
    await user.update(updateData, { transaction: t });

    if (!transaction) await t.commit();
    return user;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መቀየር ስህተት: ${error.message}`);
  }
};

const deleteUser = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate deleter role
    const deleter = await User.findByPk(deleterId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!deleter || !["አስተዳደር"].includes(deleter.role?.name)) {
      throw new Error("ተጠቃሚ መሰረዝ የሚችሉት አስተዳደር ብቻ ናቸው።");
    }

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    // Soft delete user
    await user.destroy({ transaction: t });

    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandOwner,
  getUserById,
  updateUser,
  deleteUser,
  getAllUserService,
};