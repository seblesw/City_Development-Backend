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
        "middle_name",
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
        "middle_name",
        "email",
        "phone_number",
        "role_id",
        "administrative_unit_id",
        "oversight_office_id",
        "national_id",
        "address",
        "is_active",
        "last_login",
        "profile_picture",
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
        "middle_name",
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
        "profile_picture",
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
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
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
        { model: User, as: "updater" },
        { model: User, as: "creator" },
      ],
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
        {
          model: User,
          as: "updater",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "first_name", "middle_name", "last_name"],
        },
      ],
      attributes: { exclude: ["password"] },
    });
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መቀየር ስህተት: ${error.message}`);
  }
};
const deactivateUserService = async (id, deactivatorId, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    t = t || (await sequelize.transaction());

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    if (user.is_active === false) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ ቀድሞውኑ ታግዷል!`);
    }

    // Set is_active to false and track who deactivated
    await user.update(
      {
        is_active: false,
        deleted_by: deactivatorId,
      },
      { transaction: t }
    );

    // Fetch with deactivator info
    const userWithDeactivator = await User.findByPk(id, {
      include: [
        {
          model: User,
          as: "deleter",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
        },
      ],
      transaction: t,
    });

    if (!transaction) await t.commit();

    return {
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተሰናክሏል።`,
      deactivatedUser: userWithDeactivator,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ ማሰናከል ስህተት: ${error.message}`);
  }
};
const activateUserService = async (id, activatorId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    const user = await User.findByPk(id, { transaction: t });
    if (!user) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ አልተገኘም።`);
    }

    if (user.is_active === true) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ተጠቃሚ ቀድሞውኑ አክቲቭ  ነበር።`);
    }

    // Set is_active to true and track who activated
    await user.update(
      {
        is_active: true,
        updated_by: activatorId,
      },
      { transaction: t }
    );

    if (!transaction) await t.commit();

    return {
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተነሳ።`,
      activatedUser: user,
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ተጠቃሚ መነሳት ስህተት: ${error.message}`);
  }
};
const addNewLandOwnerService = async ({
  land_record_id,
  userData,
  ownership_percentage,
  authUser,
}) => {
  const transaction = await LandOwner.sequelize.transaction();

  try {
    // 1. Validate land record exists and is shared ownership
    const landRecord = await LandRecord.findByPk(land_record_id, {
      include: [
        { model: User,
          
           as: "owners",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "national_id",
            "phone_number",
            "profile_picture",
          ],
          through: {
            model: LandOwner,
            as: "landOwner",
            attributes: ["ownership_percentage"],
          },
           },
        { model: User, as: "creator" },
      ],
      transaction,
    });

    if (!landRecord) {
      throw { status: 404, message: "የመሬት መዝገብ አልተገኘም" };
    }

    if (landRecord.ownership_category !== "የጋራ") {
      throw {
        status: 400,
        message: "የጋራ ባለቤትነት ያለው የመሬት መዝገብ ብቻ ነው ተጨማሪ ባለቤቶች የሚጨመሩት",
      };
    }

    // 2. Check if user exists by national ID
    const existingUser = await User.findOne({
      where: { national_id: userData.national_id },
      transaction,
    });

    if (existingUser) {
      // Check if user is already an owner
      const isAlreadyOwner = landRecord.owners.some(
        (owner) => owner.user_id === existingUser.id
      );

      if (isAlreadyOwner) {
        throw { status: 400, message: "ይህ ሰው ቀደም ሲል �ዚህ መሬት ባለቤት ነው" };
      }
    }

    // 3. Create new user or use existing one
    let user;
    if (existingUser) {
      user = existingUser;
    } else {
      // Hash default password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      user = await User.create(
        {
          ...userData,
          password: hashedPassword,
          administrative_unit_id: authUser.administrative_unit_id,
          is_active: true,
          created_by: authUser.id,
        },
        { transaction }
      );
    }

    // 4. Calculate ownership percentage
    let finalPercentage = ownership_percentage;

    if (!ownership_percentage) {
      const existingPercentageSum = landRecord.owners.reduce(
        (sum, owner) => sum + (owner.ownership_percentage || 0),
        0
      );

      finalPercentage =
        (100 - existingPercentageSum) / (landRecord.owners.length + 1);
    }

    // 5. Create land owner relationship
    const newOwner = await LandOwner.create(
      {
        user_id: user.id,
        land_record_id,
        ownership_percentage: finalPercentage,
        created_by: authUser.id,
      },
      { transaction }
    );

    // 6. Update land record action log
    const actionLogEntry = {
      action: `አዲስ ባለቤት ታክሏል: ${user.first_name} ${user.last_name}`,
      details: {
        user_id: user.id,
        ownership_percentage: finalPercentage,
      },
      changed_by: {
        id: authUser.id,
        name: `${authUser.first_name} ${authUser.last_name}`,
        role: authUser.role,
      },
      changed_at: new Date(),
    };

    await landRecord.update(
      {
        action_log: [...(landRecord.action_log || []), actionLogEntry],
      },
      { transaction }
    );

    await transaction.commit();

    return {
      success: true,
      message: "አዲስ ባለቤት በትክክል ታክሏል",
      data: {
        user: {
          id: user.id,
          full_name: `${user.first_name} ${
            user.middle_name ? user.middle_name + " " : ""
          }${user.last_name}`,
          national_id: user.national_id,
          phone_number: user.phone_number,
        },
        ownership: {
          percentage: finalPercentage,
          land_record_id,
          relationship_type: userData.relationship_type,
        },
        created_by: {
          id: authUser.id,
          name: `${authUser.first_name} ${authUser.last_name}`,
        },
      },
    };
  } catch (error) {
    await transaction.rollback();
    console.error("የባለቤት አገልግሎት ስህተት:", error);
    throw error;
  }
};

const removeLandOwnerFromLandService = async (
  land_record_id,
  owner_id,
  authUserId,
  options = {}
) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // 1. Validate land record exists
    const landRecord = await LandRecord.findByPk(land_record_id, {
      include: [
        {
          model: User,
          as: "owners",
          attributes: ["id", "first_name", "last_name"],
          through: { model: LandOwner, as: "landOwner" },
        },
      ],
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገብ አልተገኘም");
    }

    // 2. Check if owner exists in this land record
    const owner = landRecord.owners.find((o) => o.id === parseInt(owner_id));
    if (!owner) {
      throw new Error("ይህ ባለቤት የሚያስፈልገው መሬት አልተገኘም");
    }

    // 3. Remove the owner
    await LandOwner.destroy({
      where: { user_id: owner.id, land_record_id },
      transaction: t,
    });

    // 4. Update action log
    const actionLogEntry = {
      action: `ባለቤት ወጥቷል: ${owner.first_name} ${owner.last_name}`,
      details: { user_id: owner.id },
      changed_by: authUserId,
      changed_at: new Date(),
    };

    await landRecord.update(
      {
        action_log: [...(landRecord.action_log || []), actionLogEntry],
      },
      { transaction: t }
    );

    if (!transaction) await t.commit();

    return {
      success: true,
      message: "ባለቤት በተሳካ ሁኔታ ወጥቷል",
      data: { owner_id, land_record_id },
    };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error("የባለቤት እንደገና ማስተካከያ ስህተት:", error);
    throw new Error(`ባለቤት ማስተካከያ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createLandOwner,
  updateLandOwnersService,
  getUserById,
  addNewLandOwnerService,
  deactivateUserService,
  activateUserService,
  updateUser,
  deleteUser,
  getAllUserService,
  getAllUserByAdminUnitService,
  removeLandOwnerFromLandService,
};
