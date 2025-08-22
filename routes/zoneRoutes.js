const express = require("express");
const router = express.Router();
const {
  createZone,
  getAllZones,
  getZoneById,
  updateZone,
  deleteZone,
} = require("../controllers/zoneController");
const authmiddleware = require("../middlewares/authMiddleware");
router.post("/", authmiddleware.protect,createZone);
router.get("/", getAllZones);
router.get("/:id", getZoneById);
router.put("/:id", authmiddleware.protect,updateZone);
router.delete("/:id", authmiddleware.protect,deleteZone);

module.exports = router;