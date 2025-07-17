const {
  sequelize,
  Document,
  DOCUMENT_TYPES,
  LandRecord,
  User,
  Role,
} = require("../models");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs/promises");

const createDocumentService = async (data, files, creatorId, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    //  Validate required fields
    if (!data.plot_number || !data.document_type) {
      console.log(data)
      throw new Error("የሰነድ መረጃዎች (plot_number, document_type) አስፈላጊ ናቸው።");
    }

    if (!data.land_record_id || typeof data.land_record_id !== "number") {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ አስፈላጊ ነው።");
    }

    //  If document_type is OTHER, use other_document_type
    if (data.document_type === DOCUMENT_TYPES.OTHER) {
      if (!data.other_document_type || data.other_document_type.trim() === "") {
        throw new Error("ሌላ አማራጭ የተመረጠ ከሆነ፣ ሌላውን የሰነድ አይነት ያስገቡ።");
      }
      data.document_type = data.other_document_type.trim();
    }

    //  Check for duplicate reference number per land record
    if (data.reference_number) {
      const existingRef = await Document.findOne({
        where: {
          reference_number: data.reference_number,
          land_record_id: data.land_record_id,
          deletedAt: null,
        },
        transaction: t,
      });

      if (existingRef) {
        throw new Error("ይህ የሰነድ አመልካች ቁጥር በዚህ መሬት መዝገብ ላይ አስቀድሞ ተመዝግቧል።");
      }
    }

    //  Document versioning per land record + plot + document_type
    const version =
      (await Document.count({
        where: {
          land_record_id: data.land_record_id,
          plot_number: data.plot_number,
          document_type: data.document_type,
          deletedAt: null,
        },
        transaction: t,
      })) + 1;

    //Prepare file metadata if any
    const fileMetadata =
      Array.isArray(files) && files.length > 0
        ? files.map((file) => ({
            file_path: file.path,
            file_name: file.originalname || `document_${Date.now()}`,
            mime_type: file.mimetype || "application/octet-stream",
            file_size: file.size || 0,
          }))
        : [];

    // Create document
    const document = await Document.create(
      {
        plot_number: data.plot_number,
        document_type: data.document_type,
        other_document_type: data.other_document_type || null,
        reference_number: data.reference_number,
        description: data.description,
        files: fileMetadata,
        version,
        land_record_id: data.land_record_id,
        preparer_name: data.preparer_name || `User_${creatorId}`,
        approver_name: data.approver_name || null,
        issue_date: data.issue_date || new Date(),
        uploaded_by: creatorId,
      },
      { transaction: t }
    );

    // Log document upload to land record
    const landRecord = await LandRecord.findByPk(data.land_record_id, {
      transaction: t,
      lock: true,
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገቡ አልተገኘም።");
    }

    const currentLog = Array.isArray(landRecord.action_log)
      ? landRecord.action_log
      : [];
    const newLog = [
      ...currentLog,
      {
        action: `DOCUMENT_UPLOAD_${data.document_type}`,
        document_id: document.id,
        changed_by: creatorId,
        changed_at: new Date(),
      },
    ];

    await LandRecord.update(
      { action_log: newLog },
      { where: { id: data.land_record_id }, transaction: t }
    );

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
};


const importPDFs = async ({ files, uploaderId }) => {
  const updatedDocuments = [];
  const unmatchedLogs = [];

  for (const file of files) {
    const basePlotNumber = path.basename(
      file.originalname,
      path.extname(file.originalname)
    );

    const document = await Document.findOne({
      where: { plot_number: basePlotNumber },
    });

    if (!document) {
      const logMsg = `በዚህ ፋይል ስም የተሰየመ plot_number የለም: '${basePlotNumber}'። እባክዎ ፋይሉን እንደገና ይመልከቱ።`;
      console.warn(logMsg);
      unmatchedLogs.push(logMsg);

      // Delete unmatched file
      try {
        fs.unlink(file.path);
      } catch (err) {
        const unlinkMsg = `ፋይሉን ማጥፋት አልተቻለም: ${file.path} => ${err.message}`;
        unmatchedLogs.push(unlinkMsg);
        console.warn(unlinkMsg);
      }

      continue;
    }

    const relativePath = path.relative(path.join(__dirname, ".."), file.path);
    const filesArray = Array.isArray(document.files) ? document.files : [];

    if (!filesArray.includes(relativePath)) {
      filesArray.push(relativePath);
    }

    document.files = filesArray;
    document.set("files", filesArray);
    document.changed("files", true);
    document.uploaded_by = uploaderId;

    await document.save();

    updatedDocuments.push({
      id: document.id,
      plot_number: document.plot_number,
      files: document.files,
    });

    //  Push log to LandRecord.action_log
    const landRecord = await LandRecord.findByPk(document.land_record_id);
    if (landRecord) {
      const actionLog = Array.isArray(landRecord.action_log)
        ? landRecord.action_log
        : [];

      actionLog.push({
        action: `DOCUMENT_UPLOAD_${document.document_type}`,
        document_id: document.id,
        changed_by: uploaderId,
        changed_at: new Date().toISOString(),
      });

      landRecord.action_log = actionLog;
      landRecord.set("action_log", actionLog);
      landRecord.changed("action_log", true);
      await landRecord.save();
    }
  }

  return {
    message: `${updatedDocuments.length} document(s) linked successfully.`,
    updatedDocuments,
    unmatchedLogs,
  };
};






const addFilesToDocumentService = async (
  id,
  files,
  updaterId,
  options = {}
) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate updater role
    // Assume updaterId is the req user object, not a DB id
    const updater = updaterId;
    if (!updater) {
      L;
      throw new Error("ፋይሎችን ለመጨመር የሚችሉት በ ስይስተሙ ከገቡ ብቻ ነው");
    }

    const document = await Document.findByPk(id, { transaction: t });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    if (!files || files.length === 0) {
      throw new Error("ቢያንስ አንድ ፋይል መጨመር አለበት።");
    }

    // Prepare new files
    const newFiles = files.map((file) => ({
      file_path: file.path,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
    }));

    // Update document
    document.files = [...(document.files || []), ...newFiles];
    document.isActive = true;
    document.inActived_reason = null;
    await document.save({ transaction: t });

    // Log file addition in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `DOCUMENT_FILES_ADDED_${document.document_type}`,
          changed_by: updaterId,
          changed_at: new Date(),
          document_id: document.id,
        },
      ];
      await landRecord.save({ transaction: t });
    }

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ ፋይሎች መጨመር ስህተት: ${error.message}`);
  }
};
const getDocumentByIdService = async (id, options = {}) => {
  const { transaction } = options;
  try {
    const document = await Document.findByPk(id, {
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
      ],
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "description",
        "issue_date",
        "land_record_id",
        "preparer_name",
        "approver_name",
        "isActive",
        "inActived_reason",
        "files",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }
    return document;
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};
const getDocumentsByLandRecordId = async (landRecordId, options = {}) => {
  const { transaction } = options;
  try {
    const documents = await Document.findAll({
      where: { land_record_id: landRecordId, deletedAt: { [Op.eq]: null } },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
      ],
      attributes: [
        "id",
        "plot_number",
        "document_type",
        "reference_number",
        "description",
        "issue_date",
        "land_record_id",
        "preparer_name",
        "approver_name",
        "isActive",
        "inActived_reason",
        "files",
        "createdAt",
        "updatedAt",
        "deletedAt",
      ],
      transaction,
    });

    // No need to throw error if documents not found
    return documents || [];
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
  }
};

const updateDocumentService = async (
  id,
  data,
  files,
  updaterId,
  options = {}
) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate updater role
    const updater = updaterId;
    if (!updater) {
      throw new Error("ፋይሎችን መቀየር የሚችሉት በ ስይስተሙ ከገቡ ብቻ ነው");
    }

    const document = await Document.findByPk(id, { transaction: t });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    // Validate land_record_id if changed
    if (
      data.land_record_id &&
      data.land_record_id !== document.land_record_id
    ) {
      const landRecord = await LandRecord.findByPk(data.land_record_id, {
        transaction: t,
      });
      if (!landRecord) {
        throw new Error("ትክክለኛ የመሬት መዝገብ ይምረጡ።");
      }
    }

    // Validate plot_number uniqueness if changed
    if (
      data.plot_number &&
      (data.plot_number !== document.plot_number ||
        data.land_record_id !== document.land_record_id)
    ) {
      const existingMap = await Document.findOne({
        where: {
          plot_number: data.plot_number,
          land_record_id: data.land_record_id || document.land_record_id,
          id: { [Op.ne]: id },
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingMap) {
        throw new Error("ይህ የካርታ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");
      }
    }

    // Validate reference_number uniqueness if changed
    if (
      data.reference_number !== undefined &&
      (data.reference_number !== document.reference_number ||
        data.land_record_id !== document.land_record_id)
    ) {
      if (data.reference_number) {
        const existingRef = await Document.findOne({
          where: {
            reference_number: data.reference_number,
            land_record_id: data.land_record_id || document.land_record_id,
            id: { [Op.ne]: id },
            deletedAt: { [Op.eq]: null },
          },
          transaction: t,
        });
        if (existingRef) {
          throw new Error("ይህ የሰነድ ቁጥር ለዚህ መሬት መዝገብ ተመዝግቧል።");
        }
      }
    }

    // Prepare update data
    const updateData = {};
    const updatableFields = [
      "plot_number",
      "document_type",
      "reference_number",
      "description",
      "issue_date",
      "land_record_id",
      "preparer_name",
      "approver_name",
      "isActive",
      "inActived_reason",
    ];
    for (const field of updatableFields) {
      if (data[field] !== undefined) {
        updateData[field] = data[field];
      }
    }

    if (files && files.length > 0) {
      const newFiles = files.map((file) => ({
        file_path: file.path,
        file_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
      }));
      updateData.files = [...(document.files || []), ...newFiles];
    }

    // Log document update or activation/deactivation in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      if (data.isActive !== undefined && data.isActive !== document.isActive) {
        const action = data.isActive
          ? `DOCUMENT_ACTIVATED_${document.document_type}`
          : `DOCUMENT_DEACTIVATED_${document.document_type}`;
        landRecord.action_log = [
          ...(landRecord.action_log || []),
          {
            action,
            changed_by: updaterId,
            changed_at: new Date(),
            document_id: document.id,
          },
        ];
      } else if (Object.keys(updateData).length > 0 || files?.length > 0) {
        landRecord.action_log = [
          ...(landRecord.action_log || []),
          {
            action: `DOCUMENT_UPDATED_${document.document_type}`,
            changed_by: updaterId,
            changed_at: new Date(),
            document_id: document.id,
          },
        ];
      }
      await landRecord.save({ transaction: t });
    }

    // Update document
    updateData.updated_at = new Date();
    await document.update(updateData, { transaction: t });

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መቀየር ስህተት: ${error.message}`);
  }
};

const deleteDocumentService = async (id, deleterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;
  try {
    t = t || (await sequelize.transaction());

    // Validate deleter role
    const deleter = await User.findByPk(deleterId, {
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });
    if (!deleter || !["አስተዳደር"].includes(deleter.role?.name)) {
      throw new Error("ሰነድ መሰረዝ የሚችሉት አስተዳደር ብቻ ናቸው።");
    }

    const document = await Document.findByPk(id, { transaction: t });
    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    // Log deletion in LandRecord.action_log
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: `DOCUMENT_DELETED_${document.document_type}`,
          changed_by: deleterId,
          changed_at: new Date(),
          document_id: document.id,
        },
      ];
      await landRecord.save({ transaction: t });
    }

    // Soft delete document
    await document.destroy({ transaction: t });

    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መሰረዝ ስህተት: ${error.message}`);
  }
};

module.exports = {
  createDocumentService,
  importPDFs,
  addFilesToDocumentService,
  getDocumentByIdService,
  updateDocumentService,
  deleteDocumentService,
  getDocumentsByLandRecordId,
};
