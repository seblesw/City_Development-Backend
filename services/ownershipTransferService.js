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
        "is_dead",
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
        "is_dead",
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
            phone_number: primaryOwnerUser.phone_number || null,
            email: primaryOwnerUser.email || null,
            national_id: primaryOwnerUser.national_id || null,
          }
        : null;

      return {
        id: record.id,
        parcel_number: record.parcel_number || null,
        created_date: record.createdAt,
        address: record.address || null,
        is_dead: record.is_dead || false,
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

    // First, get the ownership transfers
    const { count, rows } = await OwnershipTransfer.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    if (rows.length === 0) {
      return {
        success: true,
        data: [],
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: limit,
        },
      };
    }

    // Extract all land record IDs from the transfers
    const landRecordIds = rows.map(transfer => transfer.land_record_id);
    
    // Get all land records with their owners in a single query
    const landRecords = await LandRecord.findAll({
      where: { id: landRecordIds },
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

    // Get all documents for these land records
    const documents = await Document.findAll({
      where: { land_record_id: landRecordIds },
      attributes: [
        "land_record_id",
        "plot_number",
        "reference_number",
        "file_number",
      ],
    });

    // Create lookup maps for faster access
    const landRecordMap = new Map();
    const documentMap = new Map();
    
    // Organize land records by ID
    landRecords.forEach(record => {
      landRecordMap.set(record.id, record);
    });
    
    // Organize documents by land_record_id (assuming one document per land record)
    documents.forEach(doc => {
      documentMap.set(doc.land_record_id, doc);
    });

    // Build the formatted response
    const formattedData = rows.map(transfer => {
      const response = transfer.toJSON();
      const landRecord = landRecordMap.get(transfer.land_record_id);
      
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
          
          // Add formatted transceiver fields
          response.transceiver_full_name = `${transceiver.first_name || ''} ${transceiver.middle_name || ''}`.trim();
          response.transceiver_phone = transceiver.phone_number;
          response.transceiver_email = transceiver.email;
          response.transceiver_nationalid = transceiver.national_id;
        } else {
          // Set null values if no owner found
          response.transceiver = null;
          response.transceiver_full_name = null;
          response.transceiver_phone = null;
          response.transceiver_email = null;
          response.transceiver_nationalid = null;
        }
      } else {
        // Set null values if no land record found
        response.land_record = null;
        response.transceiver = null;
        response.transceiver_full_name = null;
        response.transceiver_phone = null;
        response.transceiver_email = null;
        response.transceiver_nationalid = null;
      }
      
      // Add document info
      const document = documentMap.get(transfer.land_record_id);
      if (document) {
        response.document = {
          plot_number: document.plot_number,
          reference_number: document.reference_number,
          file_number: document.file_number,
        };
      } else {
        response.document = null;
      }

      return response;
    });

    return {
      success: true,
      data: formattedData,
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
 * Get simplified transfer statistics
 */

const GetTransferStatsService = async (adminUnitId) => {
  try {
    const currentDate = new Date();

    // Date calculations
    const startOfToday = new Date(currentDate);
    startOfToday.setHours(0, 0, 0, 0);
    
    const endOfToday = new Date(currentDate);
    endOfToday.setHours(23, 59, 59, 999);

    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );
    
    const endOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
      23, 59, 59, 999
    );

    const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
    
    const endOfYear = new Date(
      currentDate.getFullYear(),
      11,
      31,
      23, 59, 59, 999
    );

    const sixMonthsAgo = new Date(currentDate);
    sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

    const whereClause = { administrative_unit_id: adminUnitId };

    // Execute all queries in parallel
    const queries = await Promise.allSettled([
      // 1. Time trends
      
      // Today
      OwnershipTransfer.findOne({
        where: {
          ...whereClause,
          createdAt: { 
            [Op.gte]: startOfToday,
            [Op.lte]: endOfToday
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        raw: true,
      }),

      // This week
      OwnershipTransfer.findOne({
        where: {
          ...whereClause,
          createdAt: { 
            [Op.gte]: startOfWeek,
            [Op.lte]: endOfToday
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        raw: true,
      }),

      // This month
      OwnershipTransfer.findOne({
        where: {
          ...whereClause,
          createdAt: { 
            [Op.gte]: startOfMonth,
            [Op.lte]: endOfToday
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        raw: true,
      }),

      // This year
      OwnershipTransfer.findOne({
        where: {
          ...whereClause,
          createdAt: { 
            [Op.gte]: startOfYear,
            [Op.lte]: endOfToday
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        raw: true,
      }),

      // Last 6 months
      OwnershipTransfer.findOne({
        where: {
          ...whereClause,
          createdAt: { 
            [Op.gte]: sixMonthsAgo,
            [Op.lte]: endOfToday
          },
        },
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        raw: true,
      }),

      // 2. Overall totals
      OwnershipTransfer.findOne({
        where: whereClause,
        attributes: [
          [Sequelize.fn("COUNT", Sequelize.col("id")), "total_transfers"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_revenue"],
        ],
        raw: true,
      }),

      // 3. Property use breakdown
      OwnershipTransfer.findAll({
        where: whereClause,
        attributes: [
          "property_use",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        group: ["property_use"],
        raw: true,
      }),

      // 3. Transfer type breakdown
      OwnershipTransfer.findAll({
        where: whereClause,
        attributes: [
          "transfer_type",
          [Sequelize.fn("COUNT", Sequelize.col("id")), "count"],
          [Sequelize.fn("SUM", Sequelize.col("total_payable")), "total_payable"],
        ],
        group: ["transfer_type"],
        raw: true,
      }),
    ]);

    // Extract results with safe defaults
    const extractResult = (result) => {
      if (!result || result.status !== 'fulfilled' || !result.value) {
        return { count: 0, total_payable: 0 };
      }
      return {
        count: parseInt(result.value.count) || 0,
        total_payable: parseFloat(result.value.total_payable) || 0,
      };
    };

    const [
      today,
      thisWeek,
      thisMonth,
      thisYear,
      lastSixMonths,
      overall,
      propertyUseStats,
      transferTypeStats,
    ] = queries.map(extractResult);

    // Override extractResult for overall stats
    const overallStats = queries[5];
    const totalTransfers = overallStats.status === 'fulfilled' && overallStats.value 
      ? parseInt(overallStats.value.total_transfers) || 0 
      : 0;
    const totalRevenue = overallStats.status === 'fulfilled' && overallStats.value 
      ? parseFloat(overallStats.value.total_revenue) || 0 
      : 0;

    // For property use and transfer type stats
    const getBreakdownStats = (queryResult) => {
      if (!queryResult || queryResult.status !== 'fulfilled' || !queryResult.value) {
        return [];
      }
      return queryResult.value.map(item => ({
        type: item.property_use || item.transfer_type,
        count: parseInt(item.count) || 0,
        total_payable: parseFloat(item.total_payable) || 0,
        percentage: totalRevenue > 0 
          ? Number(((parseFloat(item.total_payable) || 0) / totalRevenue * 100).toFixed(1))
          : 0,
      }));
    };

    return {
      success: true,
      data: {
        // 1. Time trends
        time_trends: {
          today: today,
          this_week: thisWeek,
          this_month: thisMonth,
          this_year: thisYear,
          last_six_months: lastSixMonths,
        },

        // 2. Overall totals
        overall: {
          total_transfers: totalTransfers,
          total_revenue: totalRevenue,
        },

        // 3. Breakdowns
        breakdowns: {
          by_property_use: getBreakdownStats(queries[6]),
          by_transfer_type: getBreakdownStats(queries[7]),
        },

        // Metadata
        metadata: {
          generated_at: new Date().toISOString(),
          administrative_unit_id: adminUnitId,
        }
      }
    };
  } catch (error) {
    console.error("GetTransferStatsService Error:", error);
    throw new Error("Failed to fetch transfer statistics");
  }
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
