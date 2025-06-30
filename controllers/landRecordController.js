// const landService = require('../services/landRecordService');
const { validationResult } = require('express-validator');
const createLandRecordService = require("../services/landRecordService");

exports.createLandRecord = async (req, res) => {
  try {
    const { body, files, user } = req;
    const result = await createLandRecordService.createLandRecord(body, files, user);

    res.status(201).json({
      success: true,
      message: "መዝገብ በተሳካ ሁኔታ ተፈጥሯል።",
      data: {
        land_record: {
          id: result.landRecord.id,
          parcel_number: result.landRecord.parcel_number,
          land_level: result.landRecord.land_level,
          area: result.landRecord.area,
          land_use: result.landRecord.land_use,
          ownership_type: result.landRecord.ownership_type,
          record_status: result.landRecord.record_status,
          zoning_type: result.landRecord.zoning_type,
          plot_number: result.landRecord.plot_number,
          block_number: result.landRecord.block_number,
          block_special_name: result.landRecord.block_special_name,
          north_neighbor: result.landRecord.north_neighbor,
          east_neighbor: result.landRecord.east_neighbor,
          south_neighbor: result.landRecord.south_neighbor,
          west_neighbor: result.landRecord.west_neighbor,
          coordinates: result.landRecord.coordinates,
          priority: result.landRecord.priority,
        },
        primary_user: {
          id: result.primaryUser.id,
          first_name: result.primaryUser.first_name,
          last_name: result.primaryUser.last_name,
          national_id: result.primaryUser.national_id,
        },
        co_owners: result.coOwners.map((coOwner) => ({
          id: coOwner.id,
          first_name: coOwner.first_name,
          last_name: coOwner.last_name,
          national_id: coOwner.national_id,
          relationship_type: coOwner.relationship_type,
        })),
        documents: result.documents.map((doc) => ({
          id: doc.id,
          document_type: doc.document_type,
          file_path: doc.file_path,
        })),
        land_payment: result.landPayment
          ? {
              id: result.landPayment.id,
              amount: result.landPayment.amount,
              payment_date: result.landPayment.payment_date,
              payment_type: result.landPayment.payment_type,
            }
          : null,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message || "መዝገብ መፍጠር አልተሳካም።",
    });
  }
};


//     try {
//         const lands = await landService.getAllLandService();
//         res.status(200).json({ data: lands });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// exports.getLandById = async (req, res) => {
//     try {
//         const land = await landService.getLandByIdService(req.params.id);
//         if (!land) return res.status(404).json({ message: 'Land record not found.' });
//         res.status(200).json({ data: land });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// exports.updateLand = async (req, res) => {
//     try {
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

//         const updatedLand = await landService.updateLandService(req.params.id, req.body);
//         res.status(200).json({ message: 'Land record updated successfully', data: updatedLand });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };

// exports.deleteLand = async (req, res) => {
//     try {
//         await landService.deleteLandService(req.params.id);
//         res.status(200).json({ message: 'Land record deleted successfully.' });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };
// exports.getLandByOwner = async (req, res) => {
//     try {
//         const lands = await landService.getLandByOwnerService(req.params.ownerId);
//         if (!lands || lands.length === 0) return res.status(404).json({ message: 'No land records found for this owner.' });
//         res.status(200).json({ data: lands });
//     } catch (error) {
//         res.status(500).json({ message: error.message });
//     }
// };