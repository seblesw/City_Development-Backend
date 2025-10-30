const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const {
  createLeaseAgreement,
  getLeaseAgreementsByLandRecordId,
  getAllLeaseAgreements,
} = require("../controllers/leaseAgreementController");

router.post("/", authMiddleware.protect, createLeaseAgreement);
router.get("/", authMiddleware.protect, getAllLeaseAgreements);
router.get(
  "/land-record/:landRecordId",
  authMiddleware.protect,
  getLeaseAgreementsByLandRecordId
);

module.exports = router;
