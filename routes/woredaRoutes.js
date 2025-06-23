const express = require("express");
const router = express.Router();
const {
  createWoreda,
  getAllWoredas,
  getWoredaById,
  updateWoreda,
  deleteWoreda,
} = require("../controllers/woredaController");

router.post("/", createWoreda);
router.get("/", getAllWoredas);
router.get("/:id", getWoredaById);
router.put("/:id", updateWoreda);
router.delete("/:id", deleteWoreda);

module.exports = router;