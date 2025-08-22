const express = require("express");
const router = express.Router();
const {
  createRegion,
  getAllRegions,
  getRegionById,
  updateRegion,
  deleteRegion,
} = require("../controllers/regionController");
const authMiddleware = require("../middlewares/authMiddleware");
router.post("/",authMiddleware.protect, createRegion);
router.get("/",authMiddleware.protect, getAllRegions);
router.get("/:id", authMiddleware.protect,getRegionById);
router.put("/:id",authMiddleware.protect, updateRegion);
router.delete("/:id", authMiddleware.protect,deleteRegion);

module.exports = router;