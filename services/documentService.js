const { sequelize, Document, LandRecord, User, Role } = require("../models");
const { Op } = require("sequelize");

const createDocumentService = async (data, files, creatorId, options = {}) => {
  const { transaction, isImport = false } = options;
  let t = transaction;

  try {
    if (!data.map_number || !data.document_type) {
      throw new Error("የሰነድ መረጃዎች (map_number, document_type) አስፈላጊ ናቸው።");
    }

    // 🔐 File validation based on import flag
    if (!isImport) {
      if (!files || !Array.isArray(files) || files.length === 0) {
        throw new Error("ቢያንስ አንድ ፋይል መግባት አለበት።");
      }
      for (const file of files) {
        if (!file.path || typeof file.path !== 'string') {
          throw new Error("እያንዳንዱ ፋይል ትክክለኛ የፋይል መንገዴ መያዝ አለበት።");
        }
      }
    } else {
      // Optional check if files provided
      if (files && Array.isArray(files)) {
        for (const file of files) {
          if (file && file.path && typeof file.path !== 'string') {
            throw new Error("እያንዳንዱ ፋይል ትክክለኛ የፋይል መንገዴ መያዝ አለበት።");
          }
        }
      }
    }

    if (!data.land_record_id || typeof data.land_record_id !== 'number') {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ አስፈላጊ ነው።");
    }

    t = t || (await sequelize.transaction());

    // ✅ Check for unique map number
    const existingMap = await Document.findOne({
      where: {
        map_number: data.map_number,
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });
    if (existingMap) {
      throw new Error("ይህ የካርታ ቁጥር ቀድሞውኑ ተመዝግቧል።");
    }

    // ✅ Check for unique reference number if provided
    if (data.reference_number) {
      const existingRef = await Document.findOne({
        where: {
          reference_number: data.reference_number,
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingRef) {
        throw new Error("ይህ የሰነድ አመልካች ቁጥር ተመዝግቧል።");
      }
    }

    // ✅ Document versioning
    const existingDocs = await Document.findAll({
      where: {
        land_record_id: data.land_record_id,
        map_number: data.map_number,
        document_type: data.document_type,
        deletedAt: { [Op.eq]: null },
      },
      transaction: t,
    });
    const version = existingDocs.length + 1;

    // ✅ Build file metadata if files exist
    const fileMetadata = files && files.length > 0
      ? files.map((file) => ({
          file_path: file?.path || null,
          file_name: file?.originalname || null,
          mime_type: file?.mimetype || null,
          file_size: file?.size || null,
        }))
      : [];

    // ✅ Create document record
    const documentData = {
      map_number: data.map_number,
      document_type: data.document_type,
      reference_number: data.reference_number || null,
      description: data.description || null,
      files: fileMetadata,
      version,
      land_record_id: data.land_record_id,
      preparer_name: data.preparer_name || null,
      approver_name: data.approver_name || null,
      issue_date: data.issue_date || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      inActived_reason: data.inActived_reason || null,
      uploaded_by: creatorId,
    };

    const document = await Document.create(documentData, { transaction: t });

    // ✅ Log document upload in action_log of LandRecord
    const landRecord = await LandRecord.findByPk(data.land_record_id, {
      transaction: t,
    });

    if (landRecord) {
      const now = new Date();
      const newLog = {
        action: `DOCUMENT_UPLOADED_${data.document_type}`,
        document_id: document.id,
        changed_by: creatorId,
        changed_at: now,
      };

      const updatedLog = Array.isArray(landRecord.action_log)
        ? [...landRecord.action_log, newLog]
        : [newLog];

      landRecord.action_log = updatedLog;
      await landRecord.save({ transaction: t });
    }

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
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
    if (!updater ) {
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
        "map_number",
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
        "map_number",
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
    if (!updater ) {
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

    // Validate map_number uniqueness if changed
    if (
      data.map_number &&
      (data.map_number !== document.map_number ||
        data.land_record_id !== document.land_record_id)
    ) {
      const existingMap = await Document.findOne({
        where: {
          map_number: data.map_number,
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
      "map_number",
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
  addFilesToDocumentService,
  getDocumentByIdService,
  updateDocumentService,
  deleteDocumentService,
  getDocumentsByLandRecordId,
};
