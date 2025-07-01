const express = require("express");
const router = express.Router();
const landRecordController = require("../controllers/landRecordController");
const upload = require("../middlewares/fileStorage");
const authMiddleware= require("../middlewares/authMiddleware");
router.post("/",  upload.array("documents", 5), authMiddleware.protect, landRecordController.createLandRecord);
router.get("/",   landRecordController.getAllLandRecords);

module.exports = router;