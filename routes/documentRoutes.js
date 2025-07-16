const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");
const rateLimit = require("express-rate-limit");

const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "በጣም ብዙ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

// Create a document (requires authentication, multiple file upload, restricted to መዝጋቢ)
router.post(
  "/",
  upload.array("documents", 10), // This matches the field name we're using
  documentController.createDocumentController
);

// Add files to an existing document (requires authentication, multiple file upload, restricted to መዝጋቢ)
router.post(
  "/:id/files",
  authMiddleware.protect,
  // authMiddleware.restrictTo("መዝጋቢ"),
  upload.array("documents", 10),
  documentController.addFilesToDocumentController
);

// Get a document by ID (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/:id",
  authMiddleware.protect,
//   authMiddleware.restrictTo("መዝጋቢ", "አስተዳደር"),
  getLimiter,
  documentController.getDocumentByIdController
);

// Update a document (requires authentication, optional multiple file upload, restricted to አስተዳደር)
router.put(
  "/:id",
  authMiddleware.protect,
//   authMiddleware.restrictTo("አስተዳደር"),
  upload.array("documents", 10),
  documentController.updateDocumentController
);

// Delete a document (requires authentication, restricted to አስተዳደር)
router.delete(
  "/:id",
  authMiddleware.protect,
//   authMiddleware.restrictTo("አስተዳደር"),
  documentController.deleteDocumentController
);

module.exports = router;