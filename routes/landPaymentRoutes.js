const express = require("express");
const router = express.Router();
const landPaymentController = require("../controllers/landPaymentController");
const authMiddleware = require("../middlewares/authMiddleware");
router.get("/",  authMiddleware.protect,landPaymentController.getAllPaymentsController);
router.get("/land/:landId/payments", landPaymentController.getPaymentsByLandRecordIdController);
router.post("/:landId/add-payment",authMiddleware.protect, landPaymentController.addNewPaymentController);
router.get("/:id", authMiddleware.protect,landPaymentController.getLandPaymentByIdController);
router.put("/:landRecordId/payments/:paymentId", authMiddleware.protect,landPaymentController.updateSinglePaymentController);
router.delete("/:id", authMiddleware.protect,landPaymentController.deleteLandPaymentController);

module.exports = router;