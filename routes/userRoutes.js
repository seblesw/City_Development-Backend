const express = require("express");
const userController = require("../controllers/userController");
const router = express.Router();

router.post("/", userController.createLandOwnerController);
router.get("/:id", userController.getUserByIdController);
router.put("/:id", userController.updateUserController);
router.delete("/:id", userController.deleteUserController);

module.exports = router;