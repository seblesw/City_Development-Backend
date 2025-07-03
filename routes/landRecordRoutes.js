const express = require("express");
const router = express.Router();
const landRecordController = require("../controllers/landRecordController");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");

// Rate limiter for GET requests
const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit to 100 requests per window
  message: "በጣም ብዙ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

// Create a new land record (requires authentication and file upload, restricted to መዝጋቢ)
router.post(
  "/",
  authMiddleware.protect,
  authMiddleware.restrictTo("መዝጋቢ"),
  upload.array("documents", 10),
  landRecordController.createLandRecord
);

// Get all land records (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/",
  authMiddleware.protect,
  authMiddleware.restrictTo("መዝጋቢ", "አስተዳደር"),
  getLimiter,
  landRecordController.getAllLandRecords
);

// Get a single land record by ID (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/:id",
  authMiddleware.protect,
  authMiddleware.restrictTo("መዝጋቢ", "አስተዳደር"),
  getLimiter,
  landRecordController.getLandRecordById
);

// Update a land record (requires authentication, file upload, and restricted to አስተዳደር)
router.put(
  "/:id",
  authMiddleware.protect,
  authMiddleware.restrictTo("አስተዳደር"),
  upload.array("documents", 5),
  landRecordController.updateLandRecord
);

// Delete a land record (requires authentication and restricted to አስተዳደር)
router.delete(
  "/:id",
  authMiddleware.protect,
  authMiddleware.restrictTo("አስተዳደር"),
  landRecordController.deleteLandRecord
);

module.exports = router;
