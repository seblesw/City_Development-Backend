const express = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");
const router = express.Router();

router.post(  "/:land_record_id/owners",
  upload.array("profile_picture"),
  authMiddleware.protect, userController.addNewLandOwnerController);
router.get("/",  userController.getAllUsersController);
router.get("/admin-unit", authMiddleware.protect, userController.getAllUserByAdminUnitController);
router.post("/deactivate/:id", authMiddleware.protect, userController.deactivateUserController);
router.post("/activate/:id", authMiddleware.protect, userController.activateUserController);
router.get("/:id", userController.getUserByIdController);
router.put("/:id", authMiddleware.protect,userController.updateUserController);
router.delete("/:id", authMiddleware.protect, userController.deleteUserController);

module.exports = router;