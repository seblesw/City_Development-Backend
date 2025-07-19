const {
  sequelize,
  User,
  Role,
  AdministrativeUnit,
  OversightOffice,
  LandOwner,
} = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const createLandOwner = async (
  ownersData,
  administrativeUnitId,
  creatorId,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const createdOwners = await Promise.all(
      ownersData.map(async (ownerData) => {
        // Cast critical fields
        const nationalId = ownerData.national_id
          ? String(ownerData.national_id)
          : null;
        const phoneNumber = ownerData.phone_number
          ? String(ownerData.phone_number)
          : null;

        // Set default password if not provided
        const password = await bcrypt.hash("12345678", 10);

        // Try to find existing user by national ID or phone number
        const whereClause = {
          [Op.or]: [],
          deletedAt: { [Op.eq]: null },
        };

        if (nationalId) whereClause[Op.or].push({ national_id: nationalId });
        if (phoneNumber) whereClause[Op.or].push({ phone_number: phoneNumber });

        let owner =
          whereClause[Op.or].length > 0
            ? await User.findOne({ where: whereClause, transaction: t })
            : null;

        if (owner) {
          // Update existing user with new data
          await owner.update(
            {
              ...ownerData,
              national_id: nationalId,
              phone_number: phoneNumber,
              administrative_unit_id: administrativeUnitId,
              updated_by: creatorId,
            },
            { transaction: t }
          );
        } else {
          // Create new user
          owner = await User.create(
            {
              ...ownerData,
              national_id: nationalId,
              phone_number: phoneNumber,
              administrative_unit_id: administrativeUnitId,
              password,
              created_by: creatorId,
              is_active: true,
            },
            { transaction: t }
          );
        }

        return owner;
      })
    );

    if (!transaction) await t.commit();
    return createdOwners;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ባለቤቶች መፍጠር ስህተት: ${error.message}`);
  }
};
const updateLandOwnersService = async (
  landRecordId,
  existingOwners,
  newOwnersData,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    const updatedOwners = await Promise.all(
      newOwnersData.map(async (ownerData) => {
        // Verify owner exists in this land record
        const existingOwner = existingOwners.find(o => o.id === ownerData.id);
        if (!existingOwner) {
          throw new Error(`Owner ${ownerData.id} not found in this land record`);
        }

        // Directly use ownerData from body, only adding updated_by
        const updatePayload = {
          ...ownerData,
          updated_by: updater.id
        };

        await User.update(updatePayload, {
          where: { id: ownerData.id },
          transaction: t
        });

        return await User.findByPk(ownerData.id, { transaction: t });
      })
    );

    if (!transaction) await t.commit();
    return updatedOwners;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
  }
};
const getAllUserService = async (options = {}) => {
  const { transaction } = options;
  try {
    const users = await User.findAll({
      include: [
        { model: Role, as: "role", attributes: ["id", "name"] },
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: OversightOffice,
          as: "oversightOffice",
          attributes: ["id", "name"],
        },
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
        {
          model: AdministrativeUnit,
          as: "administrativeUnit",
          attributes: ["id", "name"],
        },
        {
          model: OversightOffice,
          as: "oversightOffice",
          attributes: ["id", "name"],
        },
        {
          model: User,
          as: "primaryOwner",
          attributes: ["id", "first_name", "last_name"],
        },
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
    if (
      data.administrative_unit_id &&
      data.administrative_unit_id !== user.administrative_unit_id
    ) {
      const adminUnit = await AdministrativeUnit.findByPk(
        data.administrative_unit_id,
        { transaction: t }
      );
      if (!adminUnit) {
        throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
      }
    }

    // Validate oversight_office_id if changed
    if (
      data.oversight_office_id !== undefined &&
      data.oversight_office_id !== user.oversight_office_id
    ) {
      if (data.oversight_office_id) {
        const office = await OversightOffice.findByPk(
          data.oversight_office_id,
          { transaction: t }
        );
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
        where: {
          email: data.email,
          id: { [Op.ne]: id },
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingEmail) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate phone_number uniqueness if changed
    if (data.phone_number && data.phone_number !== user.phone_number) {
      const existingPhone = await User.findOne({
        where: {
          phone_number: data.phone_number,
          id: { [Op.ne]: id },
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingPhone) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate national_id uniqueness if changed
    if (data.national_id && data.national_id !== user.national_id) {
      const existingNationalId = await User.findOne({
        where: {
          national_id: data.national_id,
          id: { [Op.ne]: id },
          deletedAt: { [Op.eq]: null },
        },
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
  updateLandOwnersService,
  getUserById,
  updateUser,
  deleteUser,
  getAllUserService,
};
