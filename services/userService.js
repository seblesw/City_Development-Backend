const { sequelize, User, Role, AdministrativeUnit, OversightOffice } = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const createLandOwner = async (primaryOwnerData, coOwnersData, creatorId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    if (!primaryOwnerData.first_name || !primaryOwnerData.last_name || !primaryOwnerData.national_id || !primaryOwnerData.administrative_unit_id || !primaryOwnerData.gender || !primaryOwnerData.marital_status) {
      throw new Error("ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ የአስተዳደር ክፍል፣ ጾታ፣ እና የጋብቻ ሁኔታ መግለጽ አለባቸው።");
    }

    t = t || (await sequelize.transaction());

    // Validate creator role
    const creator = await User.findByPk(creatorId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!creator || !["መዝጋቢ", "አስተዳደር"].includes(creator.role?.name)) {
      throw new Error("ተጠቃሚ መመዝገብ የሚችሉት መዝጋቢ ወይም አስተዳደር ብቻ ናቸው።");
    }

    // Validate administrative_unit_id
    const adminUnit = await AdministrativeUnit.findByPk(primaryOwnerData.administrative_unit_id, { transaction: t });
    if (!adminUnit) {
      throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
    }

    // Validate oversight_office_id if provided
    if (primaryOwnerData.oversight_office_id) {
      const office = await OversightOffice.findByPk(primaryOwnerData.oversight_office_id, { transaction: t });
      if (!office) {
        throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ።");
      }
    }

    // Validate role_id if provided
    if (primaryOwnerData.role_id) {
      const role = await Role.findByPk(primaryOwnerData.role_id, { transaction: t });
      if (!role) {
        throw new Error("ትክክለኛ ሚና ይምረጡ።");
      }
    }

    // Validate email uniqueness if provided
    if (primaryOwnerData.email) {
      const existingEmail = await User.findOne({
        where: { email: primaryOwnerData.email, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingEmail) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate phone_number uniqueness if provided
    if (primaryOwnerData.phone_number) {
      const existingPhone = await User.findOne({
        where: { phone_number: primaryOwnerData.phone_number, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingPhone) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Validate national_id uniqueness
    const existingNationalId = await User.findOne({
      where: { national_id: primaryOwnerData.national_id, deletedAt: { [Op.eq]: null } },
      transaction: t,
    });
    if (existingNationalId) {
      throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
    }

    // Create primary owner
    const primaryOwner = await User.create(
      {
        ...primaryOwnerData,
        password: primaryOwnerData.password ? await bcrypt.hash(primaryOwnerData.password, 10) : null,
      },
      { transaction: t }
    );

    const result = { primaryOwner, coOwners: [] };

    // Handle co-owners if marital_status is not single
    if (primaryOwnerData.marital_status !== "ነጠላ" && coOwnersData.length > 0) {
      for (const coOwnerData of coOwnersData) {
        if (!coOwnerData.first_name || !coOwnerData.last_name || !coOwnerData.national_id || !coOwnerData.administrative_unit_id || !coOwnerData.gender || !coOwnerData.marital_status) {
          throw new Error("ለተጋሪ ባለቤት ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ የአስተዳደር ክፍል፣ ጾታ፣ እና የጋብቻ ሁኔታ መግለጽ አለባቸው።");
        }

        // Validate co-owner fields
        if (coOwnerData.email) {
          const existingEmail = await User.findOne({
            where: { email: coOwnerData.email, deletedAt: { [Op.eq]: null } },
            transaction: t,
          });
          if (existingEmail) {
            throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
          }
        }
        if (coOwnerData.phone_number) {
          const existingPhone = await User.findOne({
            where: { phone_number: coOwnerData.phone_number, deletedAt: { [Op.eq]: null } },
            transaction: t,
          });
          if (existingPhone) {
            throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
          }
        }
        const existingNationalId = await User.findOne({
          where: { national_id: coOwnerData.national_id, deletedAt: { [Op.eq]: null } },
          transaction: t,
        });
        if (existingNationalId) {
          throw new Error("ይህ ብሔራዊ መታወቂዪ ቁጥር ቀደም ሲል ተመዝግቧል።");
        }
        const coOwnerAdminUnit = await AdministrativeUnit.findByPk(coOwnerData.administrative_unit_id, { transaction: t });
        if (!coOwnerAdminUnit) {
          throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ ለተጋሪ ባለቤት።");
        }
        if (coOwnerData.oversight_office_id) {
          const office = await OversightOffice.findByPk(coOwnerData.oversight_office_id, { transaction: t });
          if (!office) {
            throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ ለተጋሪ ባለቤት።");
          }
        }
        if (coOwnerData.role_id) {
          const role = await Role.findByPk(coOwnerData.role_id, { transaction: t });
          if (!role) {
            throw new Error("ትክክለኛ ሚና ይምረጡ ለተጋሪ ባለቤት።");
          }
        }

        // Create co-owner
        const coOwner = await User.create(
          {
            first_name: coOwnerData.first_name,
            last_name: coOwnerData.last_name,
            email: coOwnerData.email || null,
            phone_number: coOwnerData.phone_number || null,
            password: coOwnerData.password ? await bcrypt.hash(coOwnerData.password, 10) : null,
            role_id: coOwnerData.role_id || null,
            administrative_unit_id: coOwnerData.administrative_unit_id,
            oversight_office_id: coOwnerData.oversight_office_id || null,
            national_id: coOwnerData.national_id,
            address: coOwnerData.address || null,
            gender: coOwnerData.gender,
            relationship_type: coOwnerData.relationship_type || null,
            marital_status: coOwnerData.marital_status,
            primary_owner_id: primaryOwner.id,
            is_active: coOwnerData.is_active !== undefined ? coOwnerData.is_active : true,
          },
          { transaction: t }
        );
        result.coOwners.push(coOwner);
      }
    } else if (primaryOwnerData.marital_status !== "ነጠላ" && coOwnersData.length === 0) {
      throw new Error("የጋብቻ ሁኔታ ነጠላ ካልሆነ ተጋሪ ባለቤቶች መግለጽ አለባቸው።");
    }

    if (!transaction) await t.commit();
    return result;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የመሬት ባለቤት መፍጠር ስህተት: ${error.message}`);
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
};