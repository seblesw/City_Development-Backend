const express = require("express");
const router = express.Router();
const {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
} = require("../controllers/zoneController");

router.post("/", createZone);
router.get("/", getAllZones);
router.get("/:id", getZoneById);
router.put("/:id", updateZone);
router.delete("/:id", deleteZone);

module.exports = router;