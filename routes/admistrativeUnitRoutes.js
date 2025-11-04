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
router.get("/",authMiddleware.protect, getAllAdministrativeUnits);
router.get("/:id",authMiddleware.protect, getAdministrativeUnitById);
router.put("/:id", authMiddleware.protect, updateAdministrativeUnit);
router.delete("/:id", deleteAdministrativeUnit);

module.exports = router;