const express = require("express");
const router = express.Router();
const documentController = require("../controllers/documentController");
const upload = require("../middlewares/fileStorage");

router.post("/",  upload.array("files", 5), documentController.createDocument);
router.get("/:id",  documentController.getDocument);
router.put("/:id",  upload.array("files", 5), documentController.updateDocument);
router.delete("/:id",  documentController.deleteDocument);

module.exports = router;