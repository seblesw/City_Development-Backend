const express = require("express");
const router = express.Router();
const landPaymentController = require("../controllers/landPaymentController");

router.post("/", landPaymentController.createPayment);
router.get("/:id", landPaymentController.getPayment);
router.put("/:id", landPaymentController.updatePayment);
router.delete("/:id", landPaymentController.deletePayment);

module.exports = router;