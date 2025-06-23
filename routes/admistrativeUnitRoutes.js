const express = require("express");
const router = express.Router();
const {
  createAdministrativeUnit,
  getAllAdministrativeUnits,
  getAdministrativeUnitById,
  updateAdministrativeUnit,
  deleteAdministrativeUnit,
} = require("../controllers/administrativeUnitController");

router.post("/", createAdministrativeUnit);
router.get("/", getAllAdministrativeUnits);
router.get("/:id", getAdministrativeUnitById);
router.put("/:id", updateAdministrativeUnit);
router.delete("/:id", deleteAdministrativeUnit);

module.exports = router;