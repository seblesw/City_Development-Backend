const express = require('express');
const router = express.Router();
const {
  createLandRecord,
  getAllLandRecords,
  getLandRecordById,
  updateLandRecord,
  deleteLandRecord,
} = require('../controllers/landRecordController');

router.post('/', createLandRecord);
router.get('/', getAllLandRecords);
router.get('/:id', getLandRecordById);
router.put('/:id', updateLandRecord);
router.delete('/:id', deleteLandRecord);

module.exports = router;