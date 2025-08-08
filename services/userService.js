const {
  sequelize,
  User,
  Role,
  AdministrativeUnit,
  OversightOffice,
  LandOwner,
  LandRecord,
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
        // Sanitize and prepare data
        const nationalId = ownerData.national_id
          ? String(ownerData.national_id)
          : null;
        const phoneNumber = ownerData.phone_number
          ? String(ownerData.phone_number)
          : null;
        const profilePicture = ownerData.profile_picture || null;

        // Set secure default password
        const password = ownerData.password
          ? await bcrypt.hash(ownerData.password, 10)
          : await bcrypt.hash("12345678", 10);

        // Build search query for existing user
        const whereClause = {
          [Op.or]: [],
          deletedAt: { [Op.eq]: null },
        };

        if (nationalId) whereClause[Op.or].push({ national_id: nationalId });
        if (phoneNumber) whereClause[Op.or].push({ phone_number: phoneNumber });

        const existingUser =
          whereClause[Op.or].length > 0
            ? await User.findOne({ where: whereClause, transaction: t })
            : null;

        if (existingUser) {
          // Update existing user (preserve existing profile picture if not provided)
          await existingUser.update(
            {
              ...ownerData,
              national_id: nationalId,
              phone_number: phoneNumber,
              administrative_unit_id: administrativeUnitId,
              updated_by: creatorId,
              profile_picture: profilePicture || existingUser.profile_picture,
            },
            { transaction: t }
          );
          return existingUser;
        }

        // Create new user with profile picture if provided
        return await User.create(
          {
            ...ownerData,
            // national_id: nationalId,
            // phone_number: phoneNumber,
            administrative_unit_id: administrativeUnitId,
            password,
            profile_picture: profilePicture,
            created_by: creatorId,
            is_active: true,
          },
          { transaction: t }
        );
      })
    );

    if (!transaction) await t.commit();
    return createdOwners;
  } catch (error) {
    if (!transaction && t) await t.rollback();

    // Enhance error message with more context
    const errorMessage = `Failed to create land owners: ${error.message}`;
    console.error(errorMessage, { ownersData, administrativeUnitId });
    throw new Error(errorMessage);
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
    // First get the current land record to maintain its action log
    const landRecord = await LandRecord.findOne({
      where: { id: landRecordId },
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    const updatedOwners = await Promise.all(
      newOwnersData.map(async (ownerData) => {
        // Verify owner exists in this land record
        const existingOwner = existingOwners.find((o) => o.id === ownerData.id);
        if (!existingOwner) {
          throw new Error(
            `Owner ${ownerData.id} not found in this land record`
          );
        }

        // Capture changes for logging
        const changes = {};
        Object.keys(ownerData).forEach((key) => {
          if (
            existingOwner[key] !== ownerData[key] &&
            key !== "updated_at" &&
            key !== "created_at"
          ) {
            changes[key] = {
              from: existingOwner[key],
              to: ownerData[key],
            };
          }
        });

        // Directly use ownerData from body, only adding updated_by
        const updatePayload = {
          ...ownerData,
          updated_by: updater.id,
        };

        await User.update(updatePayload, {
          where: { id: ownerData.id },
          transaction: t,
        });

        const updatedOwner = await User.findByPk(ownerData.id, {
          transaction: t,
        });

        // Only log if there were actual changes
        if (Object.keys(changes).length > 0) {
          const currentLog = Array.isArray(landRecord.action_log)
            ? landRecord.action_log
            : [];
          const newLog = [
            ...currentLog,
            {
              action: "OWNER_UPDATED",
              owner_id: updatedOwner.id,
              owner_name: `${updatedOwner.first_name} ${
                updatedOwner.middle_name || ""
              } ${updatedOwner.last_name}`,
              changes: changes,
              changed_by: updater.id,
              changed_at: new Date(),
            },
          ];

          await LandRecord.update(
            { action_log: newLog },
            {
              where: { id: landRecordId },
              transaction: t,
            }
          );
        }

        return updatedOwner;
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
const getAllUserByAdminUnitService = async (adminUnitId, options = {}) => {
  const { transaction } = options;
  try {
    const users = await User.findAll({
      where: {
        administrative_unit_id: adminUnitId,
        deletedAt: { [Op.eq]: null },
      },
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
      order: [["createdAt", "DESC"]],
      transaction,
    });
    return users;
  } catch (error) {
    throw new Error(`በአስተዳደሩ ውስጥ ተጠቃሚዎችን ማግኘት ስህተት: ${error.message}`);
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

const deleteUser = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    t = t || (await sequelize.transaction());

    // Find user
    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    // Set deleted_by so association works
    await user.update({ deleted_by: deleterId }, { transaction: t });

    // Fetch with deleter info
    const userWithDeleter = await User.findByPk(id, {
      include: [
        {
          model: User,
          as: "deleter",
          attributes: ["id", "first_name", "middle_name", "last_name", "phone_number"],
        },
      ],
      transaction: t,
    });

    // Hard delete
    await user.destroy({ force: true, transaction: t });

    if (!transaction) await t.commit();

    return {
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተሰርዟል።`,
      deletedUser: userWithDeleter,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መሰረዝ ስህተት: ${error.message}`);
  }
};

const updateUser = async (id, data, updaterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  // Helper function to validate unique fields
  const validateUniqueFields = async (userId, updateData) => {
    const uniqueFields = [
      { field: "email", error: "ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።" },
      { field: "phone_number", error: "ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።" },
      { field: "national_id", error: "ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።" },
    ];

    for (const { field, error } of uniqueFields) {
      if (updateData[field]) {
        const existing = await User.findOne({
          where: {
            [field]: updateData[field],
            id: { [Op.ne]: userId },
            deletedAt: { [Op.eq]: null },
          },
          transaction: t,
        });
        if (existing) throw new Error(error);
      }
    }
  };

  // Helper function to prepare update data
  const prepareUpdateData = (updateData, currentUserData) => {
    const updatableFields = [
      "first_name",
      "middle_name",
      "last_name",
      "email",
      "phone_number",
      "role_id",
      "national_id",
      "address",
      "gender",
      "relationship_type",
      "marital_status",
    ];

    const filteredUpdate = {};

    for (const field of updatableFields) {
      if (
        updateData[field] !== undefined &&
        updateData[field] !== currentUserData[field]
      ) {
        filteredUpdate[field] = updateData[field];
      }
    }

    return filteredUpdate;
  };

  try {
    t = t || (await sequelize.transaction());

    // 1. Get the user to be updated
    const user = await User.findByPk(id, { 
      transaction: t,
      include: [
        { model: User, as: 'updater' },
        { model: User, as: 'creator' }
      ]
    });
    
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    // 2. Validate unique fields if they're being changed
    await validateUniqueFields(id, data);

    // 3. Validate role if changed
    if (data.role_id !== undefined && data.role_id !== user.role_id) {
      const roleExists = await Role.findByPk(data.role_id, { transaction: t });
      if (!roleExists) {
        throw new Error("ትክክለኛ ሚና ይምረጡ።");
      }
    }

    // 4. Prepare and execute update
    const updateData = prepareUpdateData(data, user);

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date();
      updateData.updated_by = updaterId; // Track who made the update
      
      await user.update(updateData, { transaction: t });
    }

    if (!transaction) await t.commit();
    
    // Return user with updater/creator information
    return await User.findByPk(id, {
      transaction: t,
      include: [
        { model: User, as: 'updater', attributes: ['id', 'first_name', 'last_name'] },
        { model: User, as: 'creator', attributes: ['id', 'first_name', 'last_name'] }
      ],
      attributes: { exclude: ['password'] }
    });
    
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መቀየር ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandOwner,
  updateLandOwnersService,
  getUserById,
  updateUser,
  deleteUser,
  getAllUserService,
  getAllUserByAdminUnitService,
};
