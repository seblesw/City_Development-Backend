const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();
// Importing the authController methods
router.post("/register", authController.registerOfficialController);
router.post("/login", authController.loginController);
router.post("/logout", authMiddleware.protect, authController.logoutController);
router.post("/forgot-password", authController.forgotPasswordController);
router.post("/change-password", authMiddleware.protect, authController.changePasswordController);

module.exports = router;