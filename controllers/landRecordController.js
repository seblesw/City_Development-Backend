const landRecordService= require("../services/landRecordService")
const createLandRecord = async (req, res) => {
  try {
    // Validate req.user
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "የተጠቃሚ መረጃ አልተገኘም። እባክዎ 'user-id' ራስጌ ያክሉ።",
      });
    }

    const { body, files } = req;
    const result = await createLandRecordService.createLandRecord(body, files, req.user);

    // Validate service result
    if (!result || !result.landRecord || !result.primaryUser) {
      throw new Error("የመዝገብ መረጃ ተመልሶ አልተገኘም።");
    }

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
        co_owners: Array.isArray(result.coOwners)
          ? result.coOwners.map((coOwner) => ({
              id: coOwner.id,
              first_name: coOwner.first_name,
              last_name: coOwner.last_name,
              national_id: coOwner.national_id,
              relationship_type: coOwner.relationship_type,
            }))
          : [],
        documents: Array.isArray(result.documents)
          ? result.documents.map((doc) => ({
              id: doc.id,
              map_number: doc.map_number,
              document_type: doc.document_type,
              reference_number: doc.reference_number,
              files: doc.files,
            }))
          : [],
        land_payment: result.landPayment
          ? {
              id: result.landPayment.id,
              payment_type: result.landPayment.payment_type,
              total_amount: result.landPayment.total_amount,
              paid_amount: result.landPayment.paid_amount,
              currency: result.landPayment.currency,
              payment_status: result.landPayment.payment_status,
              penalty_reason: result.landPayment.penalty_reason,
              description: result.landPayment.description,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error in createLandRecord:", error);
    res.status(400).json({
      success: false,
      message: error.message || "መዝገብ መፍጠር አልተሳካም።",
      details: error.stack || "ምንም ተጨማሪ መረጃ የለም።",
    });
  }
};

const getAllLandRecords = async (req, res) => {
  try {
    const landRecords = await landRecordService.getAllLandRecordService();

    const formattedRecords = landRecords.map(record => ({
      id: record.id,
      parcel_number: record.parcel_number,
      land_level: record.land_level,
      area: record.area,
      land_use: record.land_use,
      ownership_type: record.ownership_type,
      record_status: record.record_status,
      zoning_type: record.zoning_type,
      plot_number: record.plot_number,
      block_number: record.block_number,
      block_special_name: record.block_special_name,
      north_neighbor: record.north_neighbor,
      east_neighbor: record.east_neighbor,
      south_neighbor: record.south_neighbor,
      west_neighbor: record.west_neighbor,
      coordinates: record.coordinates,
      priority: record.priority,
      created_at: record.created_at,
      updated_at: record.updated_at,
      primary_user: record.primary_user
        ? {
            id: record.primary_user.id,
            first_name: record.primary_user.first_name,
            last_name: record.primary_user.last_name,
            national_id: record.primary_user.national_id,
          }
        : null,
      co_owners: record.co_owners
        ? record.co_owners.map(coOwner => ({
            id: coOwner.id,
            first_name: coOwner.first_name,
            last_name: coOwner.last_name,
            national_id: coOwner.national_id,
            relationship_type: coOwner.relationship_type,
          }))
        : [],
      documents: record.documents
        ? record.documents.map(doc => ({
            id: doc.id,
            map_number: doc.map_number,
            document_type: doc.document_type,
            reference_number: doc.reference_number,
            files: doc.files,
          }))
        : [],
      land_payment: record.land_payment
        ? {
            id: record.land_payment.id,
            payment_type: record.land_payment.payment_type,
            total_amount: record.land_payment.total_amount,
            paid_amount: record.land_payment.paid_amount,
            currency: record.land_payment.currency,
            payment_status: record.land_payment.payment_status,
            penalty_reason: record.land_payment.penalty_reason,
            description: record.land_payment.description,
          }
        : null,
    }));

    return res.status(200).json({
      success: true,
      message: "የመዝገቦች ፍለጋ ተሳክቷል።",
      data: formattedRecords,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "መመዝገቦችን ማስመዝገብ አልተሳካም።",
    });
  }
};

module.exports = { createLandRecord, getAllLandRecords };