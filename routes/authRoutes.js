const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");
const router = express.Router();
// Importing the authController methods
router.post("/register/officials",authMiddleware.protect, upload.single("profile_picture"), authController.registerOfficialByManagerController);
router.post("/register", upload.single("profile_picture"), authController.registerOfficialController);
router.post("/login", authController.loginController);
router.post('/resend-otp', authController.resendOTPController);
router.post("/verify-otp",authController.verifyOtpController)
router.post("/logout", authMiddleware.protect, authController.logoutController);
router.post("/change-password", authMiddleware.protect, authController.changePasswordController);
router.post("/forgot-password", authController.forgotPasswordController);
router.post("/reset-password", authController.resetPassword)
module.exports = router;