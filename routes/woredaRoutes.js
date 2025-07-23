const express = require("express");
const router = express.Router();
const {
  createWoreda,
  getAllWoredas,
  getWoredaById,
  updateWoreda,
  deleteWoreda,
} = require("../controllers/woredaController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/", authMiddleware.protect, createWoreda);
router.get("/", authMiddleware.protect, getAllWoredas);
router.get("/:id", authMiddleware.protect, getWoredaById);
router.put("/:id", authMiddleware.protect, updateWoreda);
router.delete("/:id", authMiddleware.protect, deleteWoreda);

module.exports = router;