const express = require("express");
const router = express.Router();
const landRecordController = require("../controllers/landRecordController");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../middlewares/authMiddleware");
const {upload} = require("../middlewares/fileStorage");

// Rate limiters
const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "በጣም ብዙ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: "በጣም ብዙ የማስፈጸሚያ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

// Draft Management Routes
router.post(
  "/drafts",
  authMiddleware.protect,
  postLimiter,
  upload.array("documents", 20),
  landRecordController.saveLandRecordAsDraft
);

router.get(
  "/drafts/:id",
  authMiddleware.protect,
  getLimiter,
  landRecordController.getDraftLandRecord
);

router.put(
  "/drafts/:id",
  authMiddleware.protect,
  postLimiter,
  upload.array("documents", 20),
  landRecordController.updateDraftLandRecord
);

router.post(
  "/drafts/:id/submit",
  authMiddleware.protect,
  postLimiter,
  landRecordController.submitDraftLandRecord
);

// Main Land Record Routes
router.post(
  "/",
  authMiddleware.protect,
  postLimiter,
  upload.array("documents", 20),
  landRecordController.createLandRecord
);

router.get(
  "/",
  authMiddleware.protect,
  // authMiddleware.restrictTo("መዝጋቢ", "አስተዳደር"),
  getLimiter,
  landRecordController.getAllLandRecords
);

router.get(
  "/my-records",
  authMiddleware.protect,
  getLimiter,
  landRecordController.getLandRecordsByCreator
);

router.get(
  "/:id",
  authMiddleware.protect,
  getLimiter,
  landRecordController.getLandRecordById
);

router.get(
  "/user/:userId",
  authMiddleware.protect,
  getLimiter,
  landRecordController.getLandRecordByUserId
);

router.put(
  "/:id",
  authMiddleware.protect,
  // authMiddleware.restrictTo("አስተዳደር"),
  postLimiter,
  upload.array("documents", 5),
  landRecordController.updateLandRecord
);

router.delete(
  "/:id",
  authMiddleware.protect,
  // authMiddleware.restrictTo("አስተዳደር"),
  landRecordController.deleteLandRecord
);

module.exports = router;