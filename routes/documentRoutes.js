const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const authMiddleware = require("../middlewares/authMiddleware");
const upload = require("../middlewares/fileStorage");
const rateLimit = require("express-rate-limit");
const getLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100,
  message: "በጣም ብዙ ጥያቄዎች፣ እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።",
});

// Create a document (requires authentication, multiple file upload, restricted to መዝጋቢ)
router.post(
  "/",
  authMiddleware.protect,
  upload.array("documents", 10), 
  documentController.createDocumentController
);
// Get all documents (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/",
  authMiddleware.protect,
  getLimiter,
  documentController.getAllDocumentsController
);

// Get documents without files for dropdown (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/without-files",
  authMiddleware.protect,
  documentController.getDocumentsWithoutFiles
);
router.post(
  "/import-pdfs",
  authMiddleware.protect,
  upload.array("documents", 3000),
  documentController.importPDFDocuments
);

// Add files to an existing document (requires authentication, multiple file upload, restricted to መዝጋቢ)
router.post(
  "/:id/files",
  authMiddleware.protect,
  upload.array("documents", 10),
  documentController.addFilesToDocumentController
);

// Get a document by ID (requires authentication, accessible to መዝጋቢ and አስተዳደር)
router.get(
  "/:id",
  authMiddleware.protect,
  getLimiter,
  documentController.getDocumentByIdController
);

// Update a document (requires authentication, optional multiple file upload, restricted to አስተዳደር)
router.put(
  "/:id",
  authMiddleware.protect,
  upload.array("documents", 10),
  documentController.updateDocumentController
);

// Delete a document (requires authentication, restricted to አስተዳደር)
router.delete(
  "/:id",
  authMiddleware.protect,
  documentController.deleteDocumentController
);
//document status toggle (activate/deactivate)
router.post(
  "/:id/status",
  authMiddleware.protect,
  documentController.toggleDocumentStatus
);


module.exports = router;
