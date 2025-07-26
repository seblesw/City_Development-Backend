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
      // console.log(data)
      throw new Error("የሰነድ መረጃዎች (plot_number, document_type) አስፈላጊ ናቸው።");
    }

    if (!data.land_record_id || typeof data.land_record_id !== "number") {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ አስፈላጊ ነው።");
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
    console.error("Document creation error:", error);
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
};


const importPDFs = async ({ files, uploaderId }) => {
  const updatedDocuments = [];
  const unmatchedLogs = [];

  for (const file of files) {
    const basePlotNumber = path.basename(file.originalname, path.extname(file.originalname));
    const document = await Document.findOne({ where: { plot_number: basePlotNumber } });

    if (!document) {
      const logMsg = `Plot number not found: ${basePlotNumber}`;
      unmatchedLogs.push(logMsg);
      try { fs.unlink(file.path); } catch (err) {
        unmatchedLogs.push(`Failed to delete file: ${err.message}`);
      }
      continue;
    }

    // Get relative path from project root
    const serverRelativePath = path.relative(path.join(__dirname, '../..'), file.path)
      .split(path.sep).join('/');

    const filesArray = Array.isArray(document.files) ? document.files : [];
    
    if (!filesArray.some(f => {
      const existingPath = typeof f === 'string' ? f : f.file_path;
      return existingPath === serverRelativePath;
    })) {
      filesArray.push({
        file_path: serverRelativePath,
        file_name: file.originalname,
        mime_type: file.mimetype || 'application/pdf',
        file_size: file.size,
        uploaded_at: new Date(),
        uploaded_by: uploaderId
      });

      await document.update({ files: filesArray });
      updatedDocuments.push(document);
    }
  }

  return {
    message: `${updatedDocuments.length} documents updated`,
    updatedDocuments,
    unmatchedLogs
  };
};




const addFilesToDocumentService = async (id, files, updaterId, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    t = t || (await sequelize.transaction());

    // Validate updater
    if (!updaterId) throw new Error("Updater ID required");

    const document = await Document.findByPk(id, { 
      transaction: t,
      lock: t.LOCK.UPDATE 
    });
    
    if (!document) throw new Error(`Document not found: ${id}`);
    if (!files?.length) throw new Error("At least one file required");

    // Normalize existing files
    const normalizedExistingFiles = Array.isArray(document.files) 
      ? document.files.map(file => typeof file === 'string' 
          ? { 
              file_path: file,
              file_name: file.split('/').pop(),
              mime_type: 'unknown',
              file_size: 0,
              uploaded_at: document.createdAt,
              uploaded_by: null
            }
          : file)
      : [];

    // Prepare new files with server-relative paths
    const newFiles = files.map(file => {
      const serverRelativePath = path.relative(path.join(__dirname, '../..'), file.path)
        .split(path.sep).join('/');

      return {
        file_path: serverRelativePath,
        file_name: file.originalname,
        mime_type: file.mimetype,
        file_size: file.size,
        uploaded_at: new Date(),
        uploaded_by: updaterId
      };
    });

    await document.update({
      files: [...normalizedExistingFiles, ...newFiles],
      isActive: true,
      inActived_reason: null
    }, { transaction: t });

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
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

// Update Documents Service
const updateDocumentsService = async (
  landRecordId,
  existingDocuments,
  newDocumentsData,
  files,
  updater,
  options = {}
) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // First get the current land record to maintain its action log
    const landRecord = await LandRecord.findOne({
      where: { id: landRecordId },
      transaction: t
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    await Promise.all(
      newDocumentsData.map(async (docData, index) => {
        const document = existingDocuments.find(d => d.id === docData.id);
        if (!document) {
          throw new Error(`አይዲ ${docData.id} ያለው ሰነድ በዚህ መዝገብ አልተገኘም`);
        }

        // Capture changes for logging
        const changes = {};
        const fileChanges = [];
        
        // Track document field changes
        Object.keys(docData).forEach(key => {
          if (document[key] !== docData[key] && 
              key !== 'updated_at' && 
              key !== 'created_at' &&
              key !== 'files') {
            changes[key] = {
              from: document[key],
              to: docData[key]
            };
          }
        });

        // Prepare update payload
        const updatePayload = {
          ...docData,
          updated_by: updater.id
        };

        // Handle file upload if present
        if (files[index]) {
          // Get existing files or initialize empty array
          const existingFiles = document.files ? [...document.files] : [];
          
          // Record file being added
          fileChanges.push({
            action: 'FILE_ADDED',
            file_name: files[index].originalname,
            mime_type: files[index].mimetype
          });

          // Add new file to the array
          existingFiles.push({
            file_path: files[index].path,
            file_name: files[index].originalname,
            mime_type: files[index].mimetype,
            uploaded_at: new Date(),
            uploaded_by: updater.id
          });

          // Assign the updated files array to the payload
          updatePayload.files = existingFiles;
        }

        await document.update(updatePayload, { transaction: t });

        // Only log if there were actual changes
        if (Object.keys(changes).length > 0 || fileChanges.length > 0) {
          const currentLog = Array.isArray(landRecord.action_log) ? landRecord.action_log : [];
          const newLog = [...currentLog, {
            action: 'DOCUMENT_UPDATED',
            document_id: document.id,
            document_type: docData.document_type || document.document_type,
            changes: Object.keys(changes).length > 0 ? changes : undefined,
            file_changes: fileChanges.length > 0 ? fileChanges : undefined,
            changed_by: updater.id,
            changed_at: new Date()
          }];

          await LandRecord.update(
            { action_log: newLog },
            {
              where: { id: landRecordId },
              transaction: t
            }
          );
        }
      })
    );

    if (!transaction) await t.commit();
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw error;
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
  updateDocumentsService,
  deleteDocumentService,
  getDocumentsByLandRecordId,
};
