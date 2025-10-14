const {
  getUserById,
  updateUser,
  deleteUser,
  getAllUserService,
  getAllUserByAdminUnitService,
  deactivateUserService,
  activateUserService,
  addNewLandOwnerService,
  removeLandOwnerFromLandService,
  getUsersByCreatorIdService,
} = require("../services/userService");
const fs = require("fs");

const addNewLandOwnerController = async (req, res) => {
  try {
    const { land_record_id } = req.params;
    const authUser = req.user;

    
    const {
      first_name,
      middle_name,
      last_name,
      email,
      phone_number,
      national_id,
      relationship_type,
      gender,
      ownership_percentage,
    } = req.body;

    
    const profile_picture = req.file
      ? `/uploads/pictures/${req.file.filename}`
      : null;

    
    if (!land_record_id) {
      
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Land record ID is required" });
    }

    const result = await addNewLandOwnerService({
      land_record_id,
      userData: {
        first_name,
        middle_name,
        last_name,
        profile_picture,
        email,
        phone_number,
        national_id,
        relationship_type,
        gender,
        password: "12345678",
      },
      ownership_percentage,
      authUser,
    });

    res.status(200).json(result);
  } catch (error) {
    
    if (req.file) fs.unlinkSync(req.file.path);

    
    res.status(error.status || 500).json({
      error: error.message || "Failed to add land owner",
    });
  }
};
const getAllUsersController = async (req, res) => {
  try {
    const users = await getAllUserService();
    return res.status(200).json({
      message: "ሁሉም ተጠቃሚዎች በተሳካ ሁኔታ ተገኝተዋል።",
      data: users,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const getUserByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተገኝቷል።`,
      data: user,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const getUsersByCreatorIdController = async (req, res) => {
  try {
    const creatorId = req.user.id;
    if (!creatorId) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    
    const { page = 1, limit = 10, is_active } = req.query;
    
    const users = await getUsersByCreatorIdService(creatorId, {
      page: parseInt(page),
      limit: parseInt(limit),
      is_active: is_active !== undefined ? is_active === 'true' : undefined
    });
    
    res.status(200).json({
      success: true,
      message: "ሁሉም ተጠቃሚዎች በተሳካ ሁኔታ ተገኝተዋል።",
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        count: users.length
      }
    });
  } catch (error) {
    return res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
};

const getAllUserByAdminUnitController = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const administrativeUnitId = req.user.administrative_unit_id;
    if (!administrativeUnitId) {
      return res.status(400).json({ error: "ተጠቃሚው የ መዘጋጃ ቤት መለያ ቁጥር የለዉም" });
    }
    const users = await getAllUserByAdminUnitService(administrativeUnitId);
    res.status(200).json({
      message: users.message || "ሁሉም ተጠቃሚዎች በተሳካ ሁኔታ ተገኝተዋል።",
      data: users,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, user: authUser } = req;

    if (!authUser) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }

    const updatedUser = await updateUser(id, body, authUser.id);

    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተቀይሯል።`,
      data: updatedUser,
    });
  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({ error: error.message });
  }
};

const deleteUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const deleterId = req.user.id;
    const result = await deleteUser(id, deleterId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const deactivateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const deactivatorId = req.user.id;

    const result = await deactivateUserService(id, deactivatorId);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const activateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const activatorId = req.user.id;

    const result = await activateUserService(id, activatorId, {
      isActive: true,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const removeOwnerController = async (req, res) => {
  try {
    const { landRecordId, ownerId } = req.params;
    userId = req.user.id;
    const result = await removeLandOwnerFromLandService(landRecordId, ownerId, userId);
    return res.status(200).json(result);
  } catch (error) {    
        return res.status(400).json({ error: error.message });
  }
};
module.exports = {
  addNewLandOwnerController,
  deactivateUserController,
  removeOwnerController,
  activateUserController,
  getUserByIdController,
  getUsersByCreatorIdController,
  updateUserController,
  getAllUsersController,
  getAllUserByAdminUnitController,
  deleteUserController,
};
