const express = require("express");
const router = express.Router();
const {
  createOversightOffice,
  getAllOversightOffices,
  getOversightOfficeById,
  updateOversightOffice,
  deleteOversightOffice,
} = require("../controllers/oversightOfficeController");

router.post("/", createOversightOffice);
router.get("/", getAllOversightOffices);
router.get("/:id", getOversightOfficeById);
router.put("/:id", updateOversightOffice);
router.delete("/:id", deleteOversightOffice);

module.exports = router;