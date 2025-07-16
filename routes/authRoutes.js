const express = require("express");
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();
// Importing the authController methods
router.post("/register", authController.registerOfficialController);
router.post("/login", authController.loginController);

module.exports = router;