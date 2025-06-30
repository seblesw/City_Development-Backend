const { sequelize, LandRecord, User, Role } = require("../models");
const { RECORD_STATUSES, NOTIFICATION_STATUSES, PRIORITIES } = require("../models/LandRecord");
const registerUserService = require("./userService");
const documentService = require("./documentService");
const landPaymentService = require("./landPaymentService");

const createLandRecord = async (data, files, creator) => {
  const transaction = await sequelize.transaction();
  try {
    // Validate creator role and administrative unit
    const creatorRecord = await User.findByPk(creator.id, {
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!creatorRecord || creatorRecord.role?.name !== "መዝጋቢ") {
      throw new Error("መዝገብ መፍጠር የሚችለው መዝጋቢ ብቻ ነው።");
    }
    if (!creatorRecord.administrative_unit_id) {
      throw new Error("የመዝጋቢ አስተዳደራዊ ክፍል መግለጽ አለበት።");
    }

    // Create primary user
    const primaryUserData = {
      ...data.primary_user,
      administrative_unit_id: creatorRecord.administrative_unit_id,
      role_id: null,
      is_active: true,
      action_log: [{ action: "CREATED", changed_by: creator.id, changed_at: new Date() }],
    };
    const primaryUser = await registerUserService.registerUserService(primaryUserData, transaction);

    // Create co-owners (if any)
    const coOwners = [];
    if (data.co_owners && Array.isArray(data.co_owners)) {
      if (primaryUser.marital_status === "ነጠላ") {
        throw new Error("ዋና ባለቤት ነጠላ ስለሆነ የጋራ ባለቤት መጨመር አይቻልም።");
      }
      for (const coOwnerData of data.co_owners) {
        const coOwner = await registerUserService.registerUserService(
          {
            ...coOwnerData,
            primary_owner_id: primaryUser.id,
            administrative_unit_id: creatorRecord.administrative_unit_id,
            role_id: null,
            email: null,
            phone_number: null,
            is_active: true,
            action_log: [{ action: "CREATED", changed_by: creator.id, changed_at: new Date() }],
          },
          transaction
        );
        coOwners.push(coOwner);
      }
    }

    // Create LandRecord
    const landRecordData = {
      parcel_number: data.land_record.parcel_number,
      land_level: data.land_record.land_level,
      administrative_unit_id: creatorRecord.administrative_unit_id,
      user_id: primaryUser.id,
      area: data.land_record.area,
      north_neighbor: data.land_record.north_neighbor || null,
      east_neighbor: data.land_record.east_neighbor || null,
      south_neighbor: data.land_record.south_neighbor || null,
      west_neighbor: data.land_record.west_neighbor || null,
      block_number: data.land_record.block_number || null,
      block_special_name: data.land_record.block_special_name || null,
      land_use: data.land_record.land_use,
      ownership_type: data.land_record.ownership_type,
      coordinates: data.land_record.coordinates || null,
      plot_number: data.land_record.plot_number || null,
      zoning_type: data.land_record.zoning_type || null,
      priority: data.land_record.priority || PRIORITIES.MEDIUM,
      record_status: RECORD_STATUSES.DRAFT,
      notification_status: NOTIFICATION_STATUSES.NOT_SENT,
      status_history: [{ status: RECORD_STATUSES.DRAFT, changed_by: creator.id, changed_at: new Date() }],
      action_log: [{ action: "CREATED", changed_by: creator.id, changed_at: new Date() }],
      created_by: creator.id,
      created_at: new Date(),
    };
    const landRecord = await LandRecord.create(landRecordData, { transaction });

    // Create Documents
    const documents = [];
    if (files && Array.isArray(files.documents)) {
      if (!data.documents || data.documents.length !== files.documents.length) {
        throw new Error("የሰነዶች መረጃ እና ፋይሎች ቁጥር መመሳሰል አለበት።");
      }
      for (let i = 0; i < files.documents.length; i++) {
        const document = await documentService.createDocument(
          {
            document_type: data.documents[i].document_type,
            metadata: data.documents[i].metadata || {},
            land_record_id: landRecord.id,
            file: files.documents[i],
            prepared_by: creator.id,
            action_log: [{ action: "CREATED", changed_by: creator.id, changed_at: new Date() }],
          },
          creator.id,
          transaction
        );
        documents.push(document);
      }
    } else {
      throw new Error("ቢያንስ አንድ ሰነድ መግለጥ አለበት።");
    }

    // Create LandPayment (if provided)
    let landPayment = null;
    if (data.land_payment) {
      landPayment = await landPaymentService.createPayment(
        {
          ...data.land_payment,
          land_record_id: landRecord.id,
          payer_id: primaryUser.id,
          action_log: [{ action: "CREATED", changed_by: creator.id, changed_at: new Date() }],
        },
        creator.id,
        transaction
      );
    }

    await transaction.commit();
    return { landRecord, primaryUser, coOwners, documents, landPayment };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports = { createLandRecord };