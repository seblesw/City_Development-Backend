const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.post("/",authMiddleware.protect, authMiddleware.restrictTo("መዝጋቢ"), userController.createLandOwnerController);
router.get("/:id", userController.getUserByIdController);
router.put("/:id", userController.updateUserController);
router.delete("/:id", userController.deleteUserController);

module.exports = router;