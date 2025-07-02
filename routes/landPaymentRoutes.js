const express = require("express");
const router = express.Router();
const landPaymentController = require("../controllers/landPaymentController");

router.post("/", landPaymentController.createPaymentController);
router.get("/:id", landPaymentController.getPaymentByIdController);
router.put("/:id", landPaymentController.updatePaymentController);
router.delete("/:id", landPaymentController.deletePaymentController);

module.exports = router;