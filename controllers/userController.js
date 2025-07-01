const {
  registerUserService,
  loginUserService,
  getUserByIdService,
  getAllUsersService,
  updateUserService,
  deleteUserService,
} = require("../services/userService");

exports.registerUser = async (req, res) => {
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
    } = req.body;

    const user = await registerUserService({
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
    });

    res.status(201).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    console.error("Register error:", { error: error.message });
    res.status(400).json({
      status: "error",
      message: error.message || "ተጠቃሚ መመዝገብ አልተሳካም።",
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, phone_number, password } = req.body;
    if (!email && !phone_number) throw new Error("ኢሜይል ወይም ስልክ ቁጥር ያስፈልጋል።");
    if (!password) throw new Error("የይለፍ ቃል ያስፈልጋል።");
    const { user, token } = await loginUserService({
      email,
      phone_number,
      password,
    });
    res.status(200).json({
      success: true,
      data: { user, token },
    });
  } catch (error) {
    console.error("Login error:", { error: error.message });
    res.status(400).json({
      success: false,
      message: error.message || "መግባት አልተሳካም።",
    });
  }
};

exports.logoutUser = async (req, res) => {
  try {
    res.status(200).json({
      status: "success",
      message: "ተጠቃሚ በተሳካ ሁኔታ ወጥቷል።",
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message || "መውጣት አልተሳካም።",
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await getUserByIdService(req.params.id);
    res.status(200).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    res.status(404).json({
      status: "error",
      message: error.message || "ተጠቃሚ አልተገኘም።",
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await getAllUsersService(req.query);
    res.status(200).json({
      status: "success",
      numberOfUsers: users.length,
      data: users,
    });
  } catch (error) {
    console.error("Get all users error:", { error: error.message });
    res.status(400).json({
      status: "error",
      message: error.message || "ተጠቃሚዎችን ማግኘት አልተሳካም።",
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
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
    } = req.body;
    const user = await updateUserService(req.params.id, {
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
    });
    res.status(200).json({
      status: "success",
      data: user,
    });
  } catch (error) {
    console.error("Update error:", { error: error.message });
    res.status(400).json({
      status: "error",
      message: error.message || "ተጠቃሚ ማዘመን አልተሳካም።",
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await deleteUserService(req.params.id, req.user.id);
    res.status(204).send();
  } catch (error) {
    console.error("Delete error:", { error: error.message });
    res.status(400).json({
      status: "error",
      message: error.message || "ተጠቃሚ መሰረዝ አልተሳካም።",
    });
  }
};