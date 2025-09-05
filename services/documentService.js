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
const fs = require("fs");

const createDocumentService = async (data, files, creatorId, options = {}) => {
  const { transaction } = options;
  const t = transaction || (await sequelize.transaction());

  try {
    // Validate required fields
    if (!data.plot_number) {
      throw new Error("የሰነድ መረጃዎች (plot_number) አስፈላጊ ናቸው።");
    }

    // Check for existing document
    const existingDocument = await Document.findOne({
      where: {
        plot_number: data.plot_number,
        deletedAt: null,
      },
      transaction: t,
    });

    if (existingDocument) {
      throw new Error("ይህ የካርታ ቁጥር ከዚህ በፊት ተመዝግቧል");
    }

    if (!data.land_record_id || typeof data.land_record_id !== "number") {
      throw new Error("ትክክለኛ የመሬት መዝገብ መታወቂያ አስፈላጊ ነው።");
    }

    // Document versioning
    const version =
      (await Document.count({
        where: {
          land_record_id: data.land_record_id,
          plot_number: data.plot_number,
          deletedAt: null,
        },
        transaction: t,
      })) + 1;

    // Prepare file metadata with server-relative paths
    const fileMetadata = [];
    if (Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        // Get server-relative path (from project root)
        const serverRelativePath = path
          .relative(
            path.join(__dirname, ".."), // Go up to project root
            file.path
          )
          .split(path.sep)
          .join("/"); // Convert to forward slashes

        fileMetadata.push({
          file_path: serverRelativePath,
          file_name:
            file.originalname ||
            `document_${Date.now()}${path.extname(file.originalname) || ""}`,
          mime_type: file.mimetype || "application/octet-stream",
          file_size: file.size || 0,
          uploaded_at: new Date(),
          uploaded_by: creatorId,
        });
      }
    }

    // Create document
    const document = await Document.create(
      {
        plot_number: data.plot_number,
        document_type: data.document_type || DOCUMENT_TYPES.TITLE_DEED,
        reference_number: data.reference_number,
        description: data.description,
        files: fileMetadata,
        version,
        land_record_id: data.land_record_id,
        verified_plan_number: data.verified_plan_number || null,
        preparer_name: data.preparer_name || null,
        approver_name: data.approver_name || null,
        issue_date: data.issue_date || new Date(),
        uploaded_by: creatorId,
        isActive: true,
      },
      { transaction: t }
    );

    // Log document creation to land record
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
        action: `DOCUMENT_CREATE_${
          data.document_type || DOCUMENT_TYPES.TITLE_DEED
        }`,
        document_id: document.id,
        changed_by: creatorId,
        changed_at: new Date(),
        details: {
          plot_number: data.plot_number,
          files_added: fileMetadata.length,
        },
      },
    ];

    await landRecord.update({ action_log: newLog }, { transaction: t });

    if (!transaction) await t.commit();
    return document;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    console.error("Document creation error:", error);
    throw new Error(`የሰነድ መፍጠር ስህተት: ${error.message}`);
  }
};
const getAllDocumentService = async (options = {}) => {
  const { transaction } = options;
  try {
    const documents = await Document.findAll({
      where: { deletedAt: { [Op.eq]: null } },
      include: [
        {
          model: LandRecord,
          as: "landRecord",
          attributes: ["id", "parcel_number"],
        },
        {
          model: User,
          as: "uploader",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
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

    return documents || [];
  } catch (error) {
    throw new Error(`የሰነድ መልሶ ማግኘት ስህተት: ${error.message}`);
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

    if (!updaterId) {
      throw new Error("ፋይሎችን ለመጨመር የሚችሉት በ ስይስተሙ ከገቡ ብቻ ነው");
    }

    const document = await Document.findByPk(id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!document) {
      throw new Error(`መለያ ቁጥር ${id} ያለው ሰነድ አልተገኘም።`);
    }

    if (!files || files.length === 0) {
      throw new Error("ቢያንስ አንድ ፋይል መጨመር አለበት።");
    }

    // Normalize existing files
    const normalizedExistingFiles = Array.isArray(document.files)
      ? document.files.map((file) =>
          typeof file === "string"
            ? {
                file_path: file,
                file_name: file.split("/").pop(),
                mime_type: "unknown",
                file_size: 0,
                uploaded_at: document.createdAt,
                uploaded_by: null,
              }
            : file
        )
      : [];

    // Prepare new files with server-relative paths
    const newFiles = files.map((file) => ({
      file_path: file.serverRelativePath,
      file_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      uploaded_at: new Date(),
      uploaded_by: updaterId,
    }));

    // Combine all files
    const updatedFiles = [...normalizedExistingFiles, ...newFiles];

    // Update the document
    await document.update(
      {
        files: updatedFiles,
        isActive: true,
        inActived_reason: null,
      },
      { transaction: t }
    );

    // Log the action
    const landRecord = await LandRecord.findByPk(document.land_record_id, {
      transaction: t,
    });
    if (landRecord) {
      landRecord.action_log = [
        ...(landRecord.action_log || []),
        {
          action: "DOCUMENT_FILES_ADDED",
          changed_by: updaterId,
          changed_at: new Date(),
          document_id: document.id,
          details: { files_added: newFiles.length },
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
const importPDFs = async ({ files, uploaderId }) => {
  const updatedDocuments = [];
  const unmatchedLogs = [];

  for (const file of files) {
    try {
      // Use preserved Unicode name for matching
      const basePlotNumber = (file.originalnameUnicode || "").normalize("NFC");

      const document = await Document.findOne({
        where: { plot_number: basePlotNumber },
      });

      if (!document) {
        const logMsg = `በዚህ ፋይል ስም የተሰየመ plot_number የለም: '${basePlotNumber}'። እባክዎ ፋይሉን እንደገና ይመልከቱ።`;
        unmatchedLogs.push(logMsg);

        try {
          fs.unlinkSync(file.path); // remove file if no match
        } catch (err) {
          unmatchedLogs.push(
            `ፋይሉን ማጥፋት አልተቻለም: ${file.path} => ${err.message}`
          );
        }
        continue;
      }

      const serverRelativePath = file.serverRelativePath;

      const filesArray = Array.isArray(document.files)
        ? document.files.map((f) =>
            typeof f === "string"
              ? {
                  file_path: f,
                  file_name: path.basename(f),
                  mime_type: "application/pdf",
                  file_size: 0,
                  uploaded_at: new Date(),
                  uploaded_by: null,
                }
              : f
          )
        : [];

      // 🔍 Check if same file name already exists
      const fileNameExists = filesArray.some(
        (f) => f.file_name === file.originalname
      );

      if (fileNameExists) {
        try {
          fs.unlinkSync(file.path); 
        } catch (err) {
          unmatchedLogs.push(
            `ፋይሉን ማጥፋት አልተቻለም: ${file.path} => ${err.message}`
          );
        }
        unmatchedLogs.push(
          `ስሙ ፡'${file.originalname}'የሆነ ፋይል አስቀድሞ አለ። ስለዚህ ዳግም መላክ አይፈቀድም።`
        );
        continue;
      }

      //  Check if same file path already exists (rare, but double safety)
      const filePathExists = filesArray.some(
        (f) => f.file_path === serverRelativePath
      );
      if (filePathExists) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          unmatchedLogs.push(
            `ፋይሉን ማጥፋት አልተቻለም: ${file.path} => ${err.message}`
          );
        }
        unmatchedLogs.push(
          `ይህ file_path አስቀድሞ አለ: '${serverRelativePath}'።`
        );
        continue;
      }

      //  Save new file metadata
      filesArray.push({
        file_path: serverRelativePath,
        file_name: file.originalname,
        mime_type: file.mimetype || "application/pdf",
        file_size: file.size,
        uploaded_at: new Date(),
        uploaded_by: uploaderId,
      });

      await document.update({
        files: filesArray,
        uploaded_by: uploaderId,
      });

      updatedDocuments.push({
        id: document.id,
        plot_number: document.plot_number,
        files: document.files,
      });

      //  Add to LandRecord action log
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
          details: {
            file_name: file.originalname,
            file_path: serverRelativePath,
          },
        });

        await landRecord.update({ action_log: actionLog });
      }
    } catch (error) {
      unmatchedLogs.push(
        `Error processing ${file.originalname}: ${error.message}`
      );
    }
  }

  return {
    message: `${updatedDocuments.length} ሰነድ(ዎች) በትክክል ተገናኝተዋል።`,
    updatedDocuments,
    unmatchedLogs,
  };
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
        {
          model: User,
          as: "uploader",
          attributes: [
            "id",
            "first_name",
            "middle_name",
            "last_name",
            "phone_number",
          ],
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
      transaction: t,
    });

    if (!landRecord) {
      throw new Error("የመሬት መዝገብ አልተገኘም።");
    }

    await Promise.all(
      newDocumentsData.map(async (docData, index) => {
        const document = existingDocuments.find((d) => d.id === docData.id);
        if (!document) {
          throw new Error(`አይዲ ${docData.id} ያለው ሰነድ በዚህ መዝገብ አልተገኘም`);
        }

        // Capture changes for logging
        const changes = {};
        const fileChanges = [];

        // Track document field changes
        Object.keys(docData).forEach((key) => {
          if (
            document[key] !== docData[key] &&
            key !== "updated_at" &&
            key !== "created_at" &&
            key !== "files"
          ) {
            changes[key] = {
              from: document[key],
              to: docData[key],
            };
          }
        });

        // Prepare update payload
        const updatePayload = {
          ...docData,
          updated_by: updater.id,
        };

        // Handle file upload if present
        if (files[index]) {
          // Get existing files or initialize empty array
          const existingFiles = document.files ? [...document.files] : [];

          // Record file being added
          fileChanges.push({
            action: "FILE_ADDED",
            file_name: files[index].originalname,
            mime_type: files[index].mimetype,
          });

          // Add new file to the array
          existingFiles.push({
            file_path: files[index].path,
            file_name: files[index].originalname,
            mime_type: files[index].mimetype,
            uploaded_at: new Date(),
            uploaded_by: updater.id,
          });

          // Assign the updated files array to the payload
          updatePayload.files = existingFiles;
        }

        await document.update(updatePayload, { transaction: t });

        // Only log if there were actual changes
        if (Object.keys(changes).length > 0 || fileChanges.length > 0) {
          const currentLog = Array.isArray(landRecord.action_log)
            ? landRecord.action_log
            : [];
          const newLog = [
            ...currentLog,
            {
              action: "DOCUMENT_UPDATED",
              document_id: document.id,
              document_type: docData.document_type || document.document_type,
              changes: Object.keys(changes).length > 0 ? changes : undefined,
              file_changes: fileChanges.length > 0 ? fileChanges : undefined,
              changed_by: updater.id,
              changed_at: new Date(),
            },
          ];

          await LandRecord.update(
            { action_log: newLog },
            {
              where: { id: landRecordId },
              transaction: t,
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
    await document.destroy({ transaction: t, force: true });

    if (!transaction) await t.commit();
    return { message: `መለያ ቁጥር ${id} ያለው ሰነድ በተሳካ ሁኔታ ተሰርዟል።` };
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`የሰነድ መሰረዝ ስህተት: ${error.message}`);
  }
};
const toggleDocumentStatusService = async (
  documentId,
  action,
  userId,
  reason
) => {
  const document = await Document.findByPk(documentId);

  if (!document) {
    throw new Error("የሰነድ መለያ ቁጥር አልተገኘም።");
  }

  // Prevent redundant operations
  if (action === "activate" && document.isActive) {
    throw new Error("ይህ ሰነድ አስቀድሞ አክቲቭ ሁኗል");
  }
  if (action === "deactivate" && !document.isActive) {
    throw new Error("ይህ ሰነድ አስቀድሞ አክቲቭ አይደለም");
  }

  // Toggle status
  document.isActive = action === "activate";

  // Only set reason when deactivating
  if (action === "deactivate") {
    document.inActived_reason = reason;
    document.inactived_by = userId;
  } else {
    document.inActived_reason = null;
    document.inactived_by = null;
  }

  await document.save();

  return {
    documentId: document.id,
    isActive: document.isActive,
    updatedAt: document.updatedAt,
    ...(!document.isActive && {
      deactivatedBy: userId,
      reason,
    }),
  };
};
module.exports = {
  createDocumentService,
  getAllDocumentService,
  getDocumentByIdService,
  importPDFs,
  addFilesToDocumentService,
  toggleDocumentStatusService,
  getDocumentByIdService,
  updateDocumentsService,
  deleteDocumentService,
  getDocumentsByLandRecordId,
};
