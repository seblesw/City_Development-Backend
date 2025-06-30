const express = require("express");
const router = express.Router();
const createLandRecordController = require("../controllers/landRecordController");
const upload = require("../middlewares/fileStorage");

router.post("/",  upload.array("documents", 5), createLandRecordController.createLandRecord);

module.exports = router;