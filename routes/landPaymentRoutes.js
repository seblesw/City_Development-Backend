const express = require("express");
const router = express.Router();
const landPaymentController = require("../controllers/landPaymentController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/:landId/add-payment",authMiddleware.protect, landPaymentController.addNewPaymentController);
router.get("/:id", landPaymentController.getLandPaymentByIdController);
router.put("/:id", landPaymentController.updateLandPaymentController);
router.delete("/:id", landPaymentController.deleteLandPaymentController);

module.exports = router;