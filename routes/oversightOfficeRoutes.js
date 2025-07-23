const express = require("express");
const router = express.Router();
const {
  createOversightOffice,
  getAllOversightOffices,
  getOversightOfficeById,
  updateOversightOffice,
  deleteOversightOffice,
  getOversightOfficeStats,
} = require("../controllers/oversightOfficeController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/",authMiddleware.protect, createOversightOffice);
router.get("/stats",authMiddleware.protect, getOversightOfficeStats);
router.get("/", getAllOversightOffices);
router.get("/:id", getOversightOfficeById);
router.put("/:id", updateOversightOffice);
router.delete("/:id", deleteOversightOffice);

module.exports = router;