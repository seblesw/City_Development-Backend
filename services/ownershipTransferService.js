// services/OwnershipTransferService.js

const {
  OwnershipTransfer,
  Sequelize,
  sequelize,
  LandRecord,
  LandOwner,
  Document,
  User,
} = require("../models");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs");

const CreateTransferService = async (data, adminUnitId, userId) => {
  const t = await sequelize.transaction();
  try {
    // Extract input
    const {
      service_rate,
      tax_rate,
      transfer_type,
      inheritance_relation,
      sale_or_gift_sub,
      property_area,
      land_value,
      building_value,
      property_use,
      plot_number: input_plot_number,
      parcel_number: input_parcel_number,
      property_location: input_property_location,
      land_record_id,
      recipient_user_id,
      recipient_full_name,
      recipient_phone,
      recipient_email,
      recipient_nationalid,
      uploadedFiles = [],
    } = data;

    // Validate minimal requirement
    if (!land_record_id) {
      throw new Error("land_record_id is required");
    }

    // Fetch LandRecord and its owners & documents
    const landRecord = await LandRecord.findOne({
      where: { id: land_record_id },
      include: [
        {
          model: User,
          as: "owners",
          through: { attributes: [] },
        },
        {
          model: Document,
          as: "documents",
        },
      ],
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    // Ensure there is at least one owner
    if (!Array.isArray(landRecord.owners) || landRecord.owners.length === 0) {
      throw new Error("No owners found for the given land record");
    }

    // Choose first owner as transceiver
    const landOwner = landRecord.owners[0];

    // Recipient handling: registered user or manual entry
    let recipientData = {};
    if (recipient_user_id) {
      const recipientUser = await User.findByPk(recipient_user_id, {
        transaction: t,
      });
      if (!recipientUser) throw new Error("Recipient user not found");
      recipientData = {
        recipient_user_id: recipientUser.id,
        recipient_full_name: `${recipientUser.first_name || ""} ${
          recipientUser.middle_name || ""
        }`.trim(),
        recipient_phone: recipientUser.phone || null,
        recipient_email: recipientUser.email || null,
        recipient_nationalid: recipientUser.national_id || null,
      };
    } else {
      // manual recipient - require minimal info
      if (!recipient_full_name || !recipient_phone) {
        throw new Error(
          "Recipient full name and phone are required for manual recipient"
        );
      }
      recipientData = {
        recipient_user_id: null,
        recipient_full_name: recipient_full_name,
        recipient_phone: String(recipient_phone),
        recipient_email: recipient_email || null,
        recipient_nationalid: recipient_nationalid || null,
      };
    }

    // Sale/Gift subtype required for sale/gift transfer_type
    if (transfer_type === "በሽያጭ ወይም በስጦታ" && !sale_or_gift_sub) {
      throw new Error(
        "sale_or_gift_sub is required for sale or gift transfers"
      );
    }

    // Free transfer (inheritance parent<->child)
    const isFreeTransfer =
      transfer_type === "በውርስ የተገኘ" &&
      (inheritance_relation === "ከልጅ ወደ ወላጅ" ||
        inheritance_relation === "ከወላጅ ወደ ልጅ");

    // Validate rates if not free transfer
    if (!isFreeTransfer) {
      if (service_rate === undefined || tax_rate === undefined) {
        throw new Error(
          "service_rate and tax_rate are required for non-inheritance transfers"
        );
      }
      const sRate = parseFloat(service_rate);
      const tRate = parseFloat(tax_rate);
      if (Number.isNaN(sRate) || sRate < 0 || sRate > 100)
        throw new Error("service_rate must be between 0 and 100");
      if (Number.isNaN(tRate) || tRate < 0 || tRate > 100)
        throw new Error("tax_rate must be between 0 and 100");
    }

    // Prepare calculation values (use landRecord fallbacks)
    const calcServiceRate = isFreeTransfer ? 0 : parseFloat(service_rate || 0);
    const calcTaxRate = isFreeTransfer ? 0 : parseFloat(tax_rate || 0);

    const serviceRateDecimal = (calcServiceRate || 0) / 100;
    const taxRateDecimal = (calcTaxRate || 0) / 100;

    const area = Number(property_area) || Number(landRecord.area) || 0;
    const landRate = Number(land_value) || Number(landRecord.land_value) || 0;
    const buildingVal =
      Number(building_value) || Number(landRecord.building_value) || 0;

    const baseValue = landRate * area + buildingVal;
    const serviceFee = baseValue * serviceRateDecimal;
    const taxAmount = baseValue * taxRateDecimal;
    const totalPayable = serviceFee + taxAmount;

    const feeCalculation = {
      baseValue: Number(baseValue.toFixed(2)),
      serviceFee: Number(serviceFee.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      totalPayable: Number(totalPayable.toFixed(2)),
      serviceRate: Number(calcServiceRate),
      taxRate: Number(calcTaxRate),
    };

    // Files processing (map to your file metadata shape)
    const fileMetadata = [];
    if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        if (!file || !file.path) continue;
        if (!fs.existsSync(file.path)) {
          console.warn("File not found on disk:", file.path);
          continue;
        }
        const serverRelativePath =
          file.serverRelativePath ||
          `uploads/documents/${
            file.filename || file.originalname || `${Date.now()}.bin`
          }`;
        fileMetadata.push({
          file_path: serverRelativePath,
          file_name:
            file.originalname || file.filename || `document_${Date.now()}`,
          mime_type: file.mimetype || "application/octet-stream",
          file_size: file.size || 0,
          uploaded_at: new Date(),
          uploaded_by: userId,
          file_id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        });
      }
    }

    // Get plot_number from landRecord.documents[0] if not provided
    let derivedPlotNumber = null;
    if (
      Array.isArray(landRecord.documents) &&
      landRecord.documents.length > 0
    ) {
      const doc = landRecord.documents[0];
      // doc may be JSON or model instance; handle both
      derivedPlotNumber =
        doc.plot_number ||
        (doc.dataValues && doc.dataValues.plot_number) ||
        null;
    }

    const transferData = {
      // references
      land_record_id: landRecord.id,

      // recipient
      ...recipientData,

      // property info - prefer explicit input then landRecord
      property_use: property_use || landRecord.property_use || null,
      transfer_type,
      sale_or_gift_sub: sale_or_gift_sub || null,
      inheritance_relation: inheritance_relation || null,
      plot_number: input_plot_number || derivedPlotNumber || null,
      parcel_number: input_parcel_number || landRecord.parcel_number || null,
      property_location: input_property_location || landRecord.location || null,

      // numeric stored copies (optional: you can avoid duplicating if you want)
      land_area: area,
      land_value: landRate,
      building_value: buildingVal,

      // fees
      base_value: feeCalculation.baseValue,
      service_fee: feeCalculation.serviceFee,
      service_rate: feeCalculation.serviceRate,
      tax_amount: feeCalculation.taxAmount,
      tax_rate: feeCalculation.taxRate,
      total_payable: feeCalculation.totalPayable,

      // transceiver auto-filled
      transceiver_full_name: `${landOwner.first_name || ""} ${
        landOwner.middle_name || ""
      }`.trim(),
      transceiver_phone: landOwner.phone || null,
      transceiver_email: landOwner.email || null,
      transceiver_nationalid: landOwner.national_id || null,

      // system
      administrative_unit_id:
        adminUnitId || landRecord.administrative_unit_id || null,
      created_by: userId,
      updated_by: userId,
      status: "pending",

      // files
      file: fileMetadata.length ? fileMetadata : null,
    };

    // Create ownership transfer
    const ownershipTransfer = await OwnershipTransfer.create(transferData, {
      transaction: t,
    });

    await t.commit();

    // Build response payload - include some land_record info
    return {
      success: true,
      message: "Ownership transfer created successfully",
      data: {
        ...ownershipTransfer.toJSON(),
        transceiver_user: {
          id: landOwner.id,
          first_name: landOwner.first_name,
          middle_name: landOwner.middle_name,
          phone: landOwner.phone,
          email: landOwner.email,
        },
        land_record: {
          id: landRecord.id,
          plot_number: transferData.plot_number,
          parcel_number: transferData.parcel_number || null,
          location: transferData.property_location || null,
        },
      },
    };
  } catch (error) {
    await t.rollback();
    // preserve original error shape for logging
    console.error("CreateTransferService Error:", error);
    if (error.name === "SequelizeValidationError") {
      const validationErrors = error.errors.map((e) => e.message);
      throw new Error(`Validation failed: ${validationErrors.join(", ")}`);
    }
    if (error.name === "SequelizeUniqueConstraintError") {
      throw new Error("A transfer with similar details already exists");
    }
    if (error.name === "SequelizeForeignKeyConstraintError") {
      throw new Error("Invalid reference: related record not found");
    }
    throw new Error(
      `Failed to create ownership transfer: ${error.message || error}`
    );
  }
};

// Service: Search Land Records by Document Plot Number and landrecord parcel number if exist -to find the landrecord for the ownershiptransfer
const searchLandRecordsService = async (searchTerm, opts = {}) => {
  const { limit = 50 } = opts;

  try {
    if (!searchTerm || String(searchTerm).trim() === "") return [];

    const q = String(searchTerm).trim();

    // 1) Find matching documents (plot_number, reference_number, file_number)
    const matchingDocuments = await Document.findAll({
      where: {
        [Op.or]: [
          { plot_number: { [Op.iLike]: `%${q}%` } },
          { reference_number: { [Op.iLike]: `%${q}%` } },
          { file_number: { [Op.iLike]: `%${q}%` } },
        ],
      },
      attributes: [
        "id",
        "land_record_id",
        "plot_number",
        "reference_number",
        "file_number",
      ],
      limit,
    });

    // 2) Find matching land records by parcel_number
    const matchingLandRecords = await LandRecord.findAll({
      where: {
        parcel_number: { [Op.iLike]: `%${q}%` },
      },
      attributes: [
        "id",
        "parcel_number",
        "createdAt",
        "address",
        "address_kebele",
        "address_ketena",
        "area",
        "land_use",
        "ownership_type",
        "administrative_unit_id",
      ],
      limit,
    });

    // 3) Collect unique land_record ids from both sources
    const allLandRecordIds = Array.from(
      new Set([
        ...matchingDocuments.map((d) => d.land_record_id).filter(Boolean),
        ...matchingLandRecords.map((r) => r.id).filter(Boolean),
      ])
    );

    if (allLandRecordIds.length === 0) return [];

    // 4) Fetch LandRecord rows with documents and owners (User via belongsToMany through LandOwner)
    const landRecords = await LandRecord.findAll({
      where: { id: allLandRecordIds },
      attributes: [
        "id",
        "parcel_number",
        "createdAt",
        "address",
        "address_kebele",
        "address_ketena",
        "area",
        "land_use",
        "ownership_type",
        "administrative_unit_id",
      ],
      include: [
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "reference_number",
            "file_number",
            "files",
          ],
          required: false,
        },
        {
          model: User,
          as: "owners",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
            "email",
            "national_id",
          ],
          required: false,
          through: {
            attributes: [],
          },
        },
      ],
    });

    // 5) Normalize/format results for client
    const results = landRecords.map((record) => {
      const docs = Array.isArray(record.documents) ? record.documents : [];
      const owners = Array.isArray(record.owners) ? record.owners : [];

      // prefer a document that matches the query (gives better relevance)
      const lowq = q.toLowerCase();
      let plotDocument =
        docs.find((d) => {
          const pn = String(d.plot_number || "").toLowerCase();
          const rn = String(d.reference_number || "").toLowerCase();
          const fn = String(d.file_number || "").toLowerCase();
          return pn.includes(lowq) || rn.includes(lowq) || fn.includes(lowq);
        }) ||
        docs[0] ||
        null;

      // primary owner (user) - first owner user if exists
      const primaryOwnerUser = owners.length > 0 ? owners[0] : null;
      const primaryOwner = primaryOwnerUser
        ? {
            id: primaryOwnerUser.id,
            first_name: primaryOwnerUser.first_name || null,
            middle_name: primaryOwnerUser.middle_name || null,
            last_name: primaryOwnerUser.last_name || null,
            phone_number: primaryOwnerUser.phone || null,
            email: primaryOwnerUser.email || null,
            national_id: primaryOwnerUser.national_id || null,
          }
        : null;

      return {
        id: record.id,
        parcel_number: record.parcel_number || null,
        created_date: record.createdAt,
        address: record.address || null,
        address_kebele: record.address_kebele || null,
        address_ketena: record.address_ketena || null,
        area: record.area || null,
        land_use: record.land_use || null,
        ownership_type: record.ownership_type || null,
        administrative_unit_id: record.administrative_unit_id || null,

        // document details
        plot_number: plotDocument ? plotDocument.plot_number : null,
        document_reference: plotDocument ? plotDocument.reference_number : null,
        document_file_number: plotDocument ? plotDocument.file_number : null,
        has_plot_document: docs.length > 0,
        documents_count: docs.length,

        // owner details (only existence matters)
        has_owners: owners.length > 0,
        owners_count: owners.length,
        primary_owner: primaryOwner,
      };
    });

    // 6) Sort results by relevance (exact parcel or plot matches first)
    results.sort((a, b) => {
      const aScore =
        (a.parcel_number &&
        a.parcel_number.toLowerCase().includes(q.toLowerCase())
          ? 2
          : 0) +
        (a.plot_number &&
        String(a.plot_number).toLowerCase().includes(q.toLowerCase())
          ? 1
          : 0);
      const bScore =
        (b.parcel_number &&
        b.parcel_number.toLowerCase().includes(q.toLowerCase())
          ? 2
          : 0) +
        (b.plot_number &&
        String(b.plot_number).toLowerCase().includes(q.toLowerCase())
          ? 1
          : 0);
      return bScore - aScore;
    });

    return results.slice(0, limit);
  } catch (error) {
    console.error("Search Land Records Service Error:", error);
    throw new Error("Failed to search land records");
  }
};
// Service: Get Land Record Owners
const getLandRecordOwnersService = async (landRecordId) => {
  try {
    if (!landRecordId) {
      throw new Error("landRecordId is required");
    }

    // Load LandRecord with its documents and owners (Users via belongsToMany)
    const landRecord = await LandRecord.findByPk(landRecordId, {
      attributes: [
        "id",
        "parcel_number",
        "createdAt",
        "address",
        "address_kebele",
        "address_ketena",
        "area",
        "land_use",
        "ownership_type",
        "administrative_unit_id",
      ],
      include: [
        {
          model: Document,
          as: "documents",
          attributes: ["id", "plot_number", "reference_number", "file_number"],
          required: false,
        },
        {
          model: User,
          as: "owners",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
            "email",
            "national_id",
          ],
          required: false,
          through: {
            attributes: ["id"], 
          },
        },
      ],
    });

    if (!landRecord) {
      throw new Error("Land record not found");
    }

    const docs = Array.isArray(landRecord.documents)
      ? landRecord.documents
      : [];
    const plotNumber = docs.length > 0 ? docs[0].plot_number || null : null;

    const owners = Array.isArray(landRecord.owners) ? landRecord.owners : [];

    // If no owners, return empty array (you can change to throw if you want)
    if (owners.length === 0) {
      return [];
    }

    // Format response
    const formatted = owners.map((user) => {
      // `user.LandOwner` holds the through join row (Sequelize uses model name by default)

      return {
        // no ownership_percentage or verified returned per request
        user: {
          id: user.id,
          first_name: user.first_name || null,
          middle_name: user.middle_name || null,
          last_name: user.last_name || null,
          phone_number:user.phone_number || null,
          email: user.email || null,
          national_id: user.national_id || null,
        },
        land_record: {
          id: landRecord.id,
          parcel_number: landRecord.parcel_number || null,
          area: landRecord.area || null,
          address: landRecord.address || null,
          address_kebele: landRecord.address_kebele || null,
          address_ketena: landRecord.address_ketena || null,
          land_use: landRecord.land_use || null,
        },
      };
    });

    return formatted;
  } catch (error) {
    console.error("Get Land Record Owners Service Error:", error);
    throw new Error("Failed to get land record owners");
  }
};

// Service: Search Recipient Users
const searchRecipientUsersService = async (searchTerm) => {
  try {
    const users = await User.findAll({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { first_name: { [Op.iLike]: `%${searchTerm}%` } },
              { middle_name: { [Op.iLike]: `%${searchTerm}%` } },
              { last_name: { [Op.iLike]: `%${searchTerm}%` } },
              { phone_number: { [Op.iLike]: `%${searchTerm}%` } },
              { email: { [Op.iLike]: `%${searchTerm}%` } },
              { national_id: { [Op.iLike]: `%${searchTerm}%` } },
            ],
          },
          { is_active: true },
        ],
      },
      attributes: [
        "id",
        "first_name",
        "middle_name",
        "last_name",
        "phone_number",
        "email",
        "national_id",
      ],
      limit: 20,
      order: [["first_name", "ASC"]],
    });

    // Format the response
    return users.map((user) => ({
      id: user.id,
      first_name: user.first_name,
      middle_name: user.middle_name,
      last_name: user.last_name,
      phone: user.phone_number,
      email: user.email,
      national_id: user.national_id,
    }));
  } catch (error) {
    console.error("Search Recipient Users Service Error:", error);
    throw new Error("Failed to search users");
  }
};

/**
 * Get transfers with pagination and filtering
 */
const GetTransfersService = async ({
  page,
  limit,
  transfer_type,
  property_use,
  adminUnitId,
}) => {
  try {
    const offset = (page - 1) * limit;

    const whereClause = { administrative_unit_id: adminUnitId };

    if (transfer_type) whereClause.transfer_type = transfer_type;
    if (property_use) whereClause.property_use = property_use;

    const { count, rows } = await OwnershipTransfer.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return {
      data: rows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: limit,
      },
    };
  } catch (error) {
    console.error("GetTransfersService Error:", error);
    throw new Error("Failed to fetch transfers");
  }
};

const GetTransferByIdService = async (id, adminUnitId) => {
  try {
    // First get the ownership transfer
    const ownershipTransfer = await OwnershipTransfer.findOne({
      where: { 
        id: id,
        administrative_unit_id: adminUnitId // Optional admin unit filter
      }
    });

    if (!ownershipTransfer) {
      return null;
    }

    // Get the associated land record with its owners
    const landRecord = await LandRecord.findOne({
      where: { id: ownershipTransfer.land_record_id },
      include: [
        {
          model: User,
          as: 'owners',
          through: { attributes: [] },
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
            "email",
            "national_id",
          ],
        }
      ],
      attributes: [
        "id",
        "parcel_number",
        "createdAt",
        "address",
        "address_kebele",
        "address_ketena",
        "area",
        "land_use",
      ],
    });

    // Get the first document of the land record
    const document = await Document.findOne({
      where: { land_record_id: ownershipTransfer.land_record_id },
      attributes: [
        "plot_number",
        "reference_number",
        "file_number",
      ],
    });

    // Build the response
    const response = ownershipTransfer.toJSON();
    
    // Add land record info
    if (landRecord) {
      response.land_record = {
        id: landRecord.id,
        parcel_number: landRecord.parcel_number,
        createdAt: landRecord.createdAt,
        address: landRecord.address,
        address_kebele: landRecord.address_kebele,
        address_ketena: landRecord.address_ketena,
        area: landRecord.area,
        land_use: landRecord.land_use,
      };
      
      // Add transceiver from first owner of land record
      if (landRecord.owners && landRecord.owners.length > 0) {
        const transceiver = landRecord.owners[0];
        response.transceiver = {
          id: transceiver.id,
          first_name: transceiver.first_name,
          middle_name: transceiver.middle_name,
          last_name: transceiver.last_name,
          phone_number: transceiver.phone_number,
          email: transceiver.email,
          national_id: transceiver.national_id,
        };
        
        // You already have recipient info in the model, but you can also add formatted transceiver fields
        // These match what your CreateTransferService tries to set
        response.transceiver_full_name = `${transceiver.first_name || ''} ${transceiver.middle_name || ''}`.trim();
        response.transceiver_phone = transceiver.phone_number;
        response.transceiver_email = transceiver.email;
        response.transceiver_nationalid = transceiver.national_id;
      }
    }
    
    // Add document info
    if (document) {
      response.document = {
        plot_number: document.plot_number,
        reference_number: document.reference_number,
        file_number: document.file_number,
      };
    }

    return response;
    
  } catch (error) {
    console.error("GetTransferByIdService Error:", error);
    throw error;
  }
};

/**
 * Update transfer status
 */
const UpdateTransferStatusService = async (id, status, adminUnitId) => {
  try {
    const transfer = await OwnershipTransfer.findOne({
      where: { id, administrative_unit_id: adminUnitId },
    });

    if (!transfer) {
      throw new Error("Ownership transfer not found");
    }

    const updatedTransfer = await transfer.update({ status });

    await createAuditLog({
      action: "UPDATE_TRANSFER_STATUS",
      entity: "OwnershipTransfer",
      entityId: id,
      adminUnitId,
      details: {
        previousStatus: transfer.status,
        newStatus: status,
      },
    });

    return updatedTransfer;
  } catch (error) {
    console.error("UpdateTransferStatusService Error:", error);
    throw new Error(`Failed to update transfer status: ${error.message}`);
  }
};

/**
 * Get comprehensive transfer statistics with time-based analytics including quarterly reports
 */
const GetTransferStatsService = async (adminUnitId) => {
  try {
    const currentDate = new Date();

    // Date calculations
    const startOfToday = new Date(currentDate);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);

    // Quarterly calculations
    const currentQuarter = Math.floor(currentDate.getMonth() / 3);
    const startOfQuarter = new Date(
      currentDate.getFullYear(),
      currentQuarter * 3,
      1
    );
    const startOfPreviousQuarter = new Date(
      currentDate.getFullYear(),
      (currentQuarter - 1) * 3,
      1
    );
    const endOfPreviousQuarter = new Date(
      currentDate.getFullYear(),
      currentQuarter * 3,
      0
    );

    const lastMonthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1
    );
    const lastMonthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0
    );

    const lastYearStart = new Date(currentDate.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(currentDate.getFullYear() - 1, 11, 31);

    const whereClause = { administrative_unit_id: adminUnitId };

    // Execute all queries in parallel
    const queries = await Promise.allSettled([
      // Overall Statistics
      OwnershipTransfer.findAll({
        where: whereClause,
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "total_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "total_revenue",
          ],
          [
            Sequelize.fn("AVG", Sequelize.col("total_payable")),
            "average_payment",
          ],
          [Sequelize.fn("MAX", Sequelize.col("total_payable")), "max_payment"],
          [Sequelize.fn("MIN", Sequelize.col("total_payable")), "min_payment"],
          [
            Sequelize.fn("SUM", Sequelize.col("land_value")),
            "total_land_value",
          ],
          [
            Sequelize.fn("SUM", Sequelize.col("building_value")),
            "total_building_value",
          ],
          [Sequelize.fn("SUM", Sequelize.col("land_area")), "total_land_area"],
        ],
        raw: true,
      }),

      // Today's Statistics
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: { [Op.gte]: startOfToday },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "daily_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "daily_revenue",
          ],
        ],
        raw: true,
      }),

      // Weekly Statistics
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: { [Op.gte]: startOfWeek },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "weekly_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "weekly_revenue",
          ],
        ],
        raw: true,
      }),

      // Monthly Statistics
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: { [Op.gte]: startOfMonth },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "monthly_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "monthly_revenue",
          ],
          [
            Sequelize.fn("AVG", Sequelize.col("total_payable")),
            "monthly_avg_payment",
          ],
        ],
        raw: true,
      }),

      // Quarterly Statistics (Current Quarter)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: { [Op.gte]: startOfQuarter },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "quarterly_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "quarterly_revenue",
          ],
          [
            Sequelize.fn("AVG", Sequelize.col("total_payable")),
            "quarterly_avg_payment",
          ],
        ],
        raw: true,
      }),

      // Previous Quarter Statistics (for growth calculation)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: startOfPreviousQuarter,
            [Op.lte]: endOfPreviousQuarter,
          },
        },
        attributes: [
          [
            Sequelize.fn("COUNT", Sequelize.col("id")),
            "previous_quarter_transfers",
          ],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "previous_quarter_revenue",
          ],
        ],
        raw: true,
      }),

      // Yearly Statistics
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: { [Op.gte]: startOfYear },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "yearly_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "yearly_revenue",
          ],
        ],
        raw: true,
      }),

      // Last Month Statistics (for growth calculation)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: lastMonthStart,
            [Op.lte]: lastMonthEnd,
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "last_month_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "last_month_revenue",
          ],
        ],
        raw: true,
      }),

      // Last Year Statistics (for growth calculation)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: lastYearStart,
            [Op.lte]: lastYearEnd,
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "last_year_transfers"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "last_year_revenue",
          ],
        ],
        raw: true,
      }),

      // Transfer Type Breakdown
      OwnershipTransfer.findAll({
        where: whereClause,
        attributes: [
          "transfer_type",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_amount"],
          [Sequelize.fn("AVG", Sequelize.col("total_payable")), "avg_amount"],
        ],
        group: ["transfer_type"],
        raw: true,
      }),

      // Property Use Statistics
      OwnershipTransfer.findAll({
        where: whereClause,
        attributes: [
          "property_use",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("AVG", Sequelize.col("land_area")), "avg_land_area"],
          [Sequelize.fn("SUM", Sequelize.col("land_area")), "total_land_area"],
        ],
        group: ["property_use"],
        raw: true,
      }),

      // Quarterly Trend (Last 8 quarters)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: new Date(currentDate.getFullYear() - 2, 0, 1),
          },
        },
        attributes: [
          [Sequelize.fn("YEAR", Sequelize.col("createdAt")), "year"],
          [Sequelize.fn("QUARTER", Sequelize.col("createdAt")), "quarter"],
          [Sequelize.fn("COUNT", Sequelize.col("id")), "transfer_count"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "quarterly_revenue",
          ],
        ],
        group: [
          Sequelize.fn("YEAR", Sequelize.col("createdAt")),
          Sequelize.fn("QUARTER", Sequelize.col("createdAt")),
        ],
        order: [
          [Sequelize.fn("YEAR", Sequelize.col("createdAt")), "ASC"],
          [Sequelize.fn("QUARTER", Sequelize.col("createdAt")), "ASC"],
        ],
        raw: true,
      }),

      // Monthly Trend (Last 12 months)
      OwnershipTransfer.findAll({
        where: {
          ...whereClause,
          createdAt: {
            [Op.gte]: new Date(
              currentDate.getFullYear() - 1,
              currentDate.getMonth(),
              1
            ),
          },
        },
        attributes: [
          [
            Sequelize.fn("DATE_FORMAT", Sequelize.col("createdAt"), "%Y-%m"),
            "month",
          ],
          [Sequelize.fn("COUNT", Sequelize.col("id")), "transfer_count"],
          [
            Sequelize.fn("SUM", Sequelize.col("total_payable")),
            "monthly_revenue",
          ],
        ],
        group: [
          Sequelize.fn("DATE_FORMAT", Sequelize.col("createdAt"), "%Y-%m"),
        ],
        order: [
          [
            Sequelize.fn("DATE_FORMAT", Sequelize.col("createdAt"), "%Y-%m"),
            "ASC",
          ],
        ],
        raw: true,
      }),
    ]);

    // Extract results from promises
    const [
      overallStats,
      dailyStats,
      weeklyStats,
      monthlyStats,
      quarterlyStats,
      previousQuarterStats,
      yearlyStats,
      lastMonthStats,
      lastYearStats,
      transferTypeStats,
      propertyUseStats,
      quarterlyTrend,
      monthlyTrend,
    ] = queries.map((q) => (q.status === "fulfilled" ? q.value : []));

    // Calculate growth rates
    const calculateGrowth = (current, previous) => {
      if (!previous || previous === 0) return current > 0 ? 100 : 0;
      return Number((((current - previous) / previous) * 100).toFixed(2));
    };

    // Current period values
    const currentMonthTransfers =
      parseInt(monthlyStats[0]?.monthly_transfers) || 0;
    const currentQuarterTransfers =
      parseInt(quarterlyStats[0]?.quarterly_transfers) || 0;
    const currentYearTransfers =
      parseInt(yearlyStats[0]?.yearly_transfers) || 0;

    const currentMonthRevenue =
      parseFloat(monthlyStats[0]?.monthly_revenue) || 0;
    const currentQuarterRevenue =
      parseFloat(quarterlyStats[0]?.quarterly_revenue) || 0;
    const currentYearRevenue = parseFloat(yearlyStats[0]?.yearly_revenue) || 0;

    // Previous period values
    const lastMonthTransfers =
      parseInt(lastMonthStats[0]?.last_month_transfers) || 0;
    const previousQuarterTransfers =
      parseInt(previousQuarterStats[0]?.previous_quarter_transfers) || 0;
    const lastYearTransfers =
      parseInt(lastYearStats[0]?.last_year_transfers) || 0;

    const lastMonthRevenue =
      parseFloat(lastMonthStats[0]?.last_month_revenue) || 0;
    const previousQuarterRevenue =
      parseFloat(previousQuarterStats[0]?.previous_quarter_revenue) || 0;
    const lastYearRevenue =
      parseFloat(lastYearStats[0]?.last_year_revenue) || 0;

    // Growth calculations
    const monthlyGrowth = calculateGrowth(
      currentMonthTransfers,
      lastMonthTransfers
    );
    const quarterlyGrowth = calculateGrowth(
      currentQuarterTransfers,
      previousQuarterTransfers
    );
    const yearlyGrowth = calculateGrowth(
      currentYearTransfers,
      lastYearTransfers
    );

    const monthlyRevenueGrowth = calculateGrowth(
      currentMonthRevenue,
      lastMonthRevenue
    );
    const quarterlyRevenueGrowth = calculateGrowth(
      currentQuarterRevenue,
      previousQuarterRevenue
    );
    const yearlyRevenueGrowth = calculateGrowth(
      currentYearRevenue,
      lastYearRevenue
    );

    // Get current quarter label
    const getQuarterLabel = (quarter) => {
      const quarters = ["Q1", "Q2", "Q3", "Q4"];
      return quarters[quarter] || `Q${quarter + 1}`;
    };

    const currentQuarterLabel = `${currentDate.getFullYear()} ${getQuarterLabel(
      currentQuarter
    )}`;

    return {
      // Overview
      overview: {
        total_transfers: parseInt(overallStats[0]?.total_transfers) || 0,
        total_revenue: parseFloat(overallStats[0]?.total_revenue) || 0,
        average_payment: parseFloat(overallStats[0]?.average_payment) || 0,
        max_payment: parseFloat(overallStats[0]?.max_payment) || 0,
        min_payment: parseFloat(overallStats[0]?.min_payment) || 0,
        total_assets_value:
          (parseFloat(overallStats[0]?.total_land_value) || 0) +
          (parseFloat(overallStats[0]?.total_building_value) || 0),
        total_land_area: parseFloat(overallStats[0]?.total_land_area) || 0,
      },

      // Real-time Statistics
      real_time: {
        today: {
          transfers: parseInt(dailyStats[0]?.daily_transfers) || 0,
          revenue: parseFloat(dailyStats[0]?.daily_revenue) || 0,
        },
        this_week: {
          transfers: parseInt(weeklyStats[0]?.weekly_transfers) || 0,
          revenue: parseFloat(weeklyStats[0]?.weekly_revenue) || 0,
        },
        this_month: {
          transfers: currentMonthTransfers,
          revenue: currentMonthRevenue,
          average_payment:
            parseFloat(monthlyStats[0]?.monthly_avg_payment) || 0,
          growth_rate: monthlyGrowth,
        },
        this_quarter: {
          period: currentQuarterLabel,
          transfers: currentQuarterTransfers,
          revenue: currentQuarterRevenue,
          average_payment:
            parseFloat(quarterlyStats[0]?.quarterly_avg_payment) || 0,
          growth_rate: quarterlyGrowth,
        },
        this_year: {
          transfers: currentYearTransfers,
          revenue: currentYearRevenue,
          growth_rate: yearlyGrowth,
        },
      },

      // Growth Metrics
      growth_metrics: {
        monthly_transfer_growth: monthlyGrowth,
        quarterly_transfer_growth: quarterlyGrowth,
        yearly_transfer_growth: yearlyGrowth,
        monthly_revenue_growth: monthlyRevenueGrowth,
        quarterly_revenue_growth: quarterlyRevenueGrowth,
        yearly_revenue_growth: yearlyRevenueGrowth,
      },

      // Breakdowns
      breakdowns: {
        by_transfer_type: (transferTypeStats || []).map((item) => ({
          type: item.transfer_type,
          count: parseInt(item.count) || 0,
          total_amount: parseFloat(item.total_amount) || 0,
          average_amount: parseFloat(item.avg_amount) || 0,
          percentage: Number(
            (
              ((parseInt(item.count) || 0) /
                (parseInt(overallStats[0]?.total_transfers) || 1)) *
              100
            ).toFixed(1)
          ),
        })),
        by_property_use: (propertyUseStats || []).map((item) => ({
          use: item.property_use,
          count: parseInt(item.count) || 0,
          average_land_area: parseFloat(item.avg_land_area) || 0,
          total_land_area: parseFloat(item.total_land_area) || 0,
        })),
      },

      // Trends
      trends: {
        quarterly_trend: (quarterlyTrend || []).map((item) => ({
          period: `${item.year} Q${item.quarter}`,
          transfer_count: parseInt(item.transfer_count) || 0,
          revenue: parseFloat(item.quarterly_revenue) || 0,
        })),
        monthly_trend: (monthlyTrend || []).map((item) => ({
          month: item.month,
          transfer_count: parseInt(item.transfer_count) || 0,
          revenue: parseFloat(item.monthly_revenue) || 0,
        })),
      },

      // Performance Summary
      performance_summary: {
        best_performing_quarter: getBestPerformingPeriod(quarterlyTrend),
        most_common_transfer_type: getMostCommonType(transferTypeStats),
        average_processing_time: "N/A", // You can implement this if you have status tracking
      },

      // Timestamp
      generated_at: new Date().toISOString(),
      data_freshness: "real_time",
      report_periods: {
        current_quarter: currentQuarterLabel,
        current_year: currentDate.getFullYear(),
      },
    };
  } catch (error) {
    console.error("GetTransferStatsService Error:", error);
    throw new Error("Failed to fetch comprehensive statistics");
  }
};

// Helper function to find best performing quarter
const getBestPerformingPeriod = (quarterlyTrend) => {
  if (!quarterlyTrend || quarterlyTrend.length === 0) return null;

  const bestQuarter = quarterlyTrend.reduce((best, current) => {
    const currentRevenue = parseFloat(current.quarterly_revenue) || 0;
    const bestRevenue = parseFloat(best.quarterly_revenue) || 0;
    return currentRevenue > bestRevenue ? current : best;
  });

  return {
    period: `${bestQuarter.year} Q${bestQuarter.quarter}`,
    revenue: parseFloat(bestQuarter.quarterly_revenue) || 0,
    transfers: parseInt(bestQuarter.transfer_count) || 0,
  };
};

// Helper function to find most common transfer type
const getMostCommonType = (transferTypeStats) => {
  if (!transferTypeStats || transferTypeStats.length === 0) return null;

  const mostCommon = transferTypeStats.reduce((most, current) => {
    const currentCount = parseInt(current.count) || 0;
    const mostCount = parseInt(most.count) || 0;
    return currentCount > mostCount ? current : most;
  });

  return {
    type: mostCommon.transfer_type,
    count: parseInt(mostCommon.count) || 0,
    percentage: Number(
      (
        ((parseInt(mostCommon.count) || 0) /
          transferTypeStats.reduce(
            (sum, item) => sum + (parseInt(item.count) || 0),
            0
          )) *
        100
      ).toFixed(1)
    ),
  };
};
module.exports = {
  CreateTransferService,
  GetTransfersService,
  GetTransferByIdService,
  UpdateTransferStatusService,
  GetTransferStatsService,
  searchLandRecordsService,
  getLandRecordOwnersService,
  searchRecipientUsersService,
};
