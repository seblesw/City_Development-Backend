const {
  registerUserService,
  loginUserService,
  getAllUsersService,
  getUserByIdService,
  updateUserService,
  deleteUserService,
} = require('../services/userService');

exports.registerUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await registerUserService(req.body, userId);
    res.status(201).json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ተጠቃሚ መፍጠር አልተሳካም።',
    });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, phone_number, password } = req.body;
    const { user, token } = await loginUserService({ email, phone_number, password });
    res.status(200).json({
      status: 'success',
      data: { user, token },
    });
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: error.message || 'መግባት አልተሳካም።',
    });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { administrativeUnitId, oversightOfficeId } = req.query;
    const users = await getAllUsersService(administrativeUnitId, oversightOfficeId);
    const numberOfUsers = users.length;
    res.status(200).json({
      status: 'success',
      numberOfUsers,
      data: users,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ተጠቃሚዎችን ማግኘት አልተሳካም።',
    });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await getUserByIdService(req.params.id);
    res.status(200).json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ተጠቃሚ አልተገኘም።',
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await updateUserService(req.params.id, req.body, userId);
    res.status(200).json({
      status: 'success',
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      status: 'error',
      message: error.message || 'ተጠቃሚ ማዘመን አልተሳካም።',
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.user.id;
    await deleteUserService(req.params.id, userId);
    res.status(204).send();
  } catch (error) {
    res.status(404).json({
      status: 'error',
      message: error.message || 'ተጠቃሚ መሰረዝ አልተሳካም።',
    });
  }
};