const express = require("express");
const router = express.Router();
const landPaymentController = require("../controllers/landPaymentController");

router.post("/", landPaymentController.createLandPaymentController);
router.get("/:id", landPaymentController.getLandPaymentByIdController);
router.put("/:id", landPaymentController.updateLandPaymentController);
router.delete("/:id", landPaymentController.deleteLandPaymentController);

module.exports = router;