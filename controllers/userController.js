const {
  getUserById,
  updateUser,
  deleteUser,
  getAllUserService,
  getAllUserByAdminUnitService,
  deactivateUserService,
  activateUserService,
  addNewLandOwnerService,
} = require("../services/userService");

const addNewLandOwnerController = async (req, res) => {
  try {
    const { land_record_id } = req.params;
    const authUser = req.user;

    // Extract all fields from body
    const { 
      first_name,
      middle_name,
      last_name,
      email,
      phone_number,
      national_id,
      relationship_type,
      gender,
      ownership_percentage
    } = req.body;

    // Get uploaded file path (relative to your server root)
    const profile_picture = req.file ? `/uploads/pictures/${req.file.filename}` : null;

    // Basic validation
    if (!land_record_id) {
      // Clean up uploaded file if validation fails
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
        password: "12345678" 
      },
      ownership_percentage,
      authUser
    });

    res.status(200).json(result);

  } catch (error) {
    // Clean up uploaded file if error occurs
    if (req.file) fs.unlinkSync(req.file.path);
    
    console.error("Error adding land owner:", error);
    res.status(error.status || 500).json({
      error: error.message || "Failed to add land owner"
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

module.exports = {
  addNewLandOwnerController,
  deactivateUserController,
  activateUserController,
  getUserByIdController,
  updateUserController,
  getAllUsersController,
  getAllUserByAdminUnitController,
  deleteUserController,
};
