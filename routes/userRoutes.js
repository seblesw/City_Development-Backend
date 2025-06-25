const express = require("express");
const {
  registerUser,
  loginUser,
  logoutUser,
  getUserById,
  getAllUsers,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/:id", getUserById);
router.get("/", getAllUsers);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;