const express = require("express");
const router = express.Router();
const landRecordController = require("../controllers/landRecordController");
const rateLimit = require("express-rate-limit");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");

// Rate limiters
const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "በጣም ብዙ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "በጣም ብዙ የማስፈጸሚያ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});
// Import Land Records from an XLSX file with server-sent events (SSE) for progress tracking
router.post(
  "/import",
  authMiddleware.protect,
  // progressMiddlewareSSE,
  upload.single("file"),
  landRecordController.importLandRecordsFromXLSX
);
router.get('/actions/recent', landRecordController.getRecentActions);
router.get("/trash", authMiddleware.protect, landRecordController.getTrash);
router.get(
  "/stats",
  authMiddleware.protect,
  landRecordController.getLandRecordStatsController
),
router.get("/land-banks", authMiddleware.protect, landRecordController.getLandBankRecords)
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
  // postLimiter,
  upload.fields([
    { name: 'documents', maxCount: 20 },
    { name: 'profile_picture', maxCount: 10 },
    { name: 'profile_picture_0', maxCount: 10 }
  ]),  landRecordController.createLandRecord
);
router.post(
  "/:id/status",
  authMiddleware.protect,
  landRecordController.changeRecordStatus
);
//get the land records the primary owner
router.get(
  "/my-land-records",
  authMiddleware.protect,
  getLimiter,
  landRecordController.getMyLandRecords
);
// This route is used to get all land records, accessible by the system admin or authorized users
router.get(
  "/",
  authMiddleware.protect,
  // getLimiter,
  landRecordController.getAllLandRecords
);
router.get('/filter-options', landRecordController.getFilterOptions);

router.get('/stat', landRecordController.getLandRecordsStats);
//this helps to filter land records geographically by admin unit
router.get(
  "/admin-unit-records",
  authMiddleware.protect,
  landRecordController.getLandRecordsByUserAdminUnit
);
router.get(
  "/admin-unit-records/rejected",
  authMiddleware.protect,
  landRecordController.getRejectedLandRecords
);

// This route is used to get land records created by the logged-in user only records he created
router.get(
  "/my-records",
  authMiddleware.protect,
  landRecordController.getLandRecordsByCreator
);

router.get(
  "/:id",
  authMiddleware.protect,
  landRecordController.getLandRecordById
);

router.get(
  "/user/:userId",
  authMiddleware.protect,
  landRecordController.getLandRecordByUserId
);

router.put(
  "/:id",
  authMiddleware.protect,
  postLimiter,
  upload.array("documents", 10),
  landRecordController.updateLandRecord
);

//trash management
// This route is used to move a land record to the trash
router.post("/:id/trash", authMiddleware.protect, landRecordController.moveToTrash);

router.post(
  "/:id/restore",
  authMiddleware.protect,
  landRecordController.restoreFromTrash
);

router.delete(
  "/:id/permanent",
  authMiddleware.protect,
  landRecordController.permanentlyDelete
);

module.exports = router;
