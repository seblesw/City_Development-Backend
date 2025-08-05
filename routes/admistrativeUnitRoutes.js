const express = require("express");
const router = express.Router();
const {
  createAdministrativeUnit,
  getAllAdministrativeUnits,
  getAdministrativeUnitById,
  updateAdministrativeUnit,
  deleteAdministrativeUnit,
} = require("../controllers/administrativeUnitController");
const authMiddleware= require("../middlewares/authMiddleware");

router.post("/", authMiddleware.protect,createAdministrativeUnit);
router.get("/", getAllAdministrativeUnits);
router.get("/:id", getAdministrativeUnitById);
router.put("/:id", authMiddleware.protect, updateAdministrativeUnit);
router.delete("/:id", deleteAdministrativeUnit);

module.exports = router;