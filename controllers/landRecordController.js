const { sequelize, RECORD_STATUSES,LandRecord, Document } = require("../models");
const fs = require("fs");
const { Op } = require("sequelize");

const {
  createLandRecordService,
  getAllLandRecordService,
  getLandRecordByIdService,
  updateLandRecordService,
  getLandRecordByUserIdService,
  getLandRecordsByCreatorService,
  getMyLandRecordsService,
  getLandRecordsByUserAdminUnitService,
  changeRecordStatusService,
  moveToTrashService,
  restoreFromTrashService,
  permanentlyDeleteService,
  getTrashItemsService,
  getRejectedLandRecordsService,
  getLandRecordStats,
  importLandRecordsFromXLSXService,
  getLandBankRecordsService,
  getLandRecordsStatsService,
  getFilterOptionsService,
  getLandRecordsStatsByAdminUnit,
} = require("../services/landRecordService");

const createLandRecord = async (req, res) => {
  try {
    const user = req.user;

    const owners = JSON.parse(req.body.owners || "[]");
    const land_record = JSON.parse(req.body.land_record || "{}");
    const documents = JSON.parse(req.body.documents || "[]");
    const land_payment = JSON.parse(req.body.land_payment || "{}");
    const organization_info = JSON.parse(req.body.organization_info || "{}"); 
    const points = JSON.parse(req.body.points || "[]");
    const result = await createLandRecordService(
      {
        owners,
        land_record,
        documents,
        land_payment,
        organization_info, 
        points
      },
      req.files,
      user
    );

    try {
      const landRecord = await LandRecord.findByPk(result.landRecord.id, {
        include: [{
          model: Document,
          as: 'documents',
          attributes: ['plot_number']
        }]
      });
      
      if (landRecord) {
        try {
          const io = req.app.get('io');
          const { notifyNewAction } = require('../utils/notificationUtils'); 
          
          if (io && notifyNewAction) {
            const plotNumber = landRecord?.documents?.[0]?.plot_number || null;
            
            await notifyNewAction(io, { 
              landRecordId: landRecord.id,
              parcelNumber: landRecord.parcel_number,
              action_type: 'RECORD_CREATED', 
              performed_by: user.id, 
              administrative_unit_id: landRecord.administrative_unit_id,
              notes: `አዲስ የመሬት መዝገብ ተፈጥሯል - የመሬት ቁጥር: ${landRecord.parcel_number}`,
              additional_data: {
                status: landRecord.record_status,
                owners_count: owners.length,
                documents_count: documents.length,
                changed_by_name: `${user.first_name} ${user.middle_name || ''}`.trim(),
                plot_number: plotNumber,
                action_description: "የመሬት መዝገብ ተፈጥሯል",
                ownership_category: landRecord.ownership_category,
                ...(landRecord.ownership_category === 'የድርጅት' && result.organization && {
                  organization_name: result.organization.name,
                  organization_type: result.organization.organization_type
                })
              }
            });
            
          }
        } catch (notificationError) {
          throw new Error(' Notification error:', notificationError.message);
        }
      }
    } catch (logError) {
      throw new Error(`Logging error: ${logError.message}`);
    }

    return res.status(201).json({
      status: "success",
      message: "የመሬት መዝገብ በተሳካ ሁኔታ ተፈጥሯል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመዝገብ መፍጠር ስህተት: ${error.message}`,
    });
  }
};

const importLandRecordsFromXLSX = async (req, res) => {
  const t = await sequelize.transaction();
  
  try {
    if (!req.file) {
      throw new Error("XLSX ፋይል ያስፈልጋል።");
    }
    const results = await importLandRecordsFromXLSXService(
      req.file.path,
      req.user,
      { 
        transaction: t
      }
    );

    await t.commit();
    
    
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(201).json({
      status: "success",
      message: `XLSX በተሳካ ሁኔታ ተጭኗል። ${results.createdCount}/${results.totalRows} መዝገቦች ተፈጥረዋል።`,
      data: {
        createdCount: results.createdCount,
        skippedCount: results.skippedCount,
        totalRows: results.totalRows,
        errors: results.errors || [],
        errorDetails: results.errorDetails || [],
        processingTime: results.processingTime,
        performance: results.performance
      }
    });

  } catch (error) {
    await t.rollback();
    
    
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    

    res.status(400).json({
      status: "error",
      message: error.message,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    });
  }
};

const getAllLandRecords = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      includeDeleted = false,
      ...queryParams
    } = req.query;

    const result = await getAllLandRecordService({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      includeDeleted: includeDeleted === 'true',
      queryParams: queryParams
    });

    return res.status(200).json({
      status: "success",
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};


const getFilterOptions = async (req, res) => {
  try {
    const result = await getFilterOptionsService();
    
    return res.status(200).json({
      status: "success",
      message: "Filter options retrieved successfully",
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};


const getLandRecordsStats = async (req, res) => {
  try {
    const adminUnitId = req.user.administrative_unit_id;
    const result = await getLandRecordsStatsByAdminUnit(adminUnitId);
    
    return res.status(200).json({
      status: "success",
      message: "Statistics retrieved successfully",
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
};


const getLandRecordById = async (req, res) => {
  try {
    const landRecord = await getLandRecordByIdService(req.params.id);
    if (!landRecord) {
      throw new Error(`መለያ ቁጥር ${req.params.id} ያለው የመሬት መዝገብ አልተገኘም።`);
    }
    return res.status(200).json({
      status: "success",
      message: `መለያ ቁጥር ${req.params.id} ያለው የመሬት መዝገብ በተሳካ ሁኔታ ተገኝቷል።`,
      data: landRecord,
    });
  } catch (error) {
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 400;
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
    });
  }
};


const getLandRecordByUserId = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    if (isNaN(userId)) {
      return res
        .status(400)
        .json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }

    const records = await getLandRecordByUserIdService(userId);

    res.status(200).json({ status: "success", data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
};


const getLandRecordsByCreator = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    if (isNaN(userId)) {
      return res
        .status(400)
        .json({ status: "error", message: "የተሳሳተ ባለቤት መለያ ቁጥር" });
    }

    
    const {
      page = 1,
      pageSize = 10,
      includeDeleted = false,
      ...queryParams
    } = req.query;

    const records = await getLandRecordsByCreatorService(userId, {
      page: parseInt(page),
      pageSize: Math.min(parseInt(pageSize), 100),
      includeDeleted: includeDeleted === 'true',
      queryParams: queryParams
    });

    res.status(200).json({ 
      status: "success", 
      count: records.total,
      totalPages: records.totalPages,
      currentPage: records.page,
      pageSize: records.pageSize,
      message: 'የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።',
      data: records.data,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "የመሬት መዝገቦችን ማግኘት አልተሳካም።",
    });
  }
};
const getMyLandRecords = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const records = await getMyLandRecordsService(user.id);

    return res.status(200).json({
      status: "success",
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: records,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`,
      code: "error",
    });
  }
};

const getLandRecordsByUserAdminUnit = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id || !user.administrative_unit_id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ ወይም የአስተዳደር ክፍል አልተገለጸም። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const {
      page = 1,
      pageSize = 10,
      includeDeleted = false,
      ...queryParams
    } = req.query;

    const result = await getLandRecordsByUserAdminUnitService(
      user.administrative_unit_id,
      {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        includeDeleted: includeDeleted === 'true',
        queryParams: queryParams
      }
    );

    return res.status(200).json({
      status: "success",
      message: "የመሬት መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const getRejectedLandRecords = async (req, res) => {
  try {
    const user = req.user;

    if (!user || !user.id || !user.administrative_unit_id) {
      return res.status(401).json({
        status: "error",
        message: "ያልተፈቀደ መዳረሻ ወይም የአስተዳደር ክፍል አልተገለጸም። እባክዎ ይግቡ።",
        code: "unauthorized",
      });
    }

    const records = await getRejectedLandRecordsService(
      user.administrative_unit_id
    );

    
    const adminUnitName =
      records.length > 0 &&
      records[0].administrative_unit &&
      records[0].administrative_unit.name
        ? records[0].administrative_unit.name
        : "አስተዳደር ክፍል";

    return res.status(200).json({
      status: "success",
      count: records.length,
      message: `የ ${adminUnitName} መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።`,
      data: records,
    });
  } catch (error) {
    return res.status(400).json({
      status: "error",
      message: `የመሬት መዝገቦችን ማግኘት ስህተት: ${error.message}`,
      code: "error",
    });
  }
};

const updateLandRecord = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const recordId = req.params.id;

    if (!recordId) {
      throw new Error("የመሬት አይዲ ያስገቡ");
    }
    if (!user?.id) {
      throw new Error("ተጠቃሚው መለያ ቁጥር አልተገለጸም።");
    }

    const updateData = {
      owners: req.body.owners
        ? safeJsonParse(req.body.owners, "owners")
        : undefined,
      land_record: req.body.land_record
        ? safeJsonParse(req.body.land_record, "land_record")
        : {},
      documents: req.body.documents
        ? safeJsonParse(req.body.documents, "documents")
        : undefined,
      payments: req.body.payments
        ? safeJsonParse(req.body.payments, "payments")
        : undefined,
      coordinates: req.body.coordinates  
        ? safeJsonParse(req.body.coordinates, "coordinates")
        : undefined,
    };

    const hasUpdates = Object.values(updateData).some(
      (field) =>
        field !== undefined && (!Array.isArray(field) || field.length > 0)
    );
    if (!hasUpdates) {
      throw new Error("ቢያንስ አንድ የሚያዘምኑ መረጃ አለብዎት።");
    }

    const updatedRecord = await updateLandRecordService(
      recordId,
      updateData,
      req.files || [],
      user,
      { transaction: t }
    );

    await t.commit();

    return res.status(200).json({
      status: "success",
      message: "Land record updated successfully",
      data: updatedRecord,
      changes: {
        owners_updated: !!updateData.owners,
        land_record_updated: !!updateData.land_record,
        documents_updated: !!updateData.documents,
        payment_updated: !!updateData.payments,
        coordinates_updated: !!updateData.coordinates, // Changed to coordinates_updated
      },
    });
  } catch (error) {
    await t.rollback();

    const statusCode = getStatusCodeForError(error);
    return res.status(statusCode).json({
      status: "error",
      message: error.message,
      details:
        process.env.NODE_ENV === "development"
          ? {
              stack: error.stack,
              error: error.message,
            }
          : undefined,
    });
  }
};
const getLandBankRecords = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, pageSize = 10 } = req.query; 
    
    const result = await getLandBankRecordsService(user, parseInt(page), parseInt(pageSize));
    
    return res.status(200).json({
      status: 'success',
      count: result.count,
      totalPages: result.totalPages,
      currentPage: result.currentPage,
      pageSize: result.pageSize,
      message: 'የመሬት ባንክ መዝገቦች በተሳካ ሁኔታ ተገኝተዋል።',
      data: result.data,
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: `የመዝገብ ማግኘት ስህተት: ${error.message}`,
    });
  }
};

const safeJsonParse = (str, fieldName) => {
  try {
    const parsed = JSON.parse(str);
    if (fieldName === "documents" && !Array.isArray(parsed)) {
      throw new Error(`Documents data must be an array`);
    }
    return parsed;
  } catch (e) {
    throw new Error(`Invalid JSON format for ${fieldName}: ${e.message}`);
  }
};
const getStatusCodeForError = (error) => {
  if (error.message.includes("not found")) return 404;
  if (
    error.message.includes("invalid") ||
    error.message.includes("required") ||
    error.message.includes("must be")
  )
    return 400;
  if (
    error.message.includes("unauthorized") ||
    error.message.includes("permission")
  )
    return 403;
  return 500;
};
const getRecentActions = async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    
    const landRecords = await LandRecord.findAll({
      attributes: ['id', 'parcel_number', 'action_log'],
      where: {
        action_log: {
          [Op.ne]: null
        }
      }
    });

    
    let allActions = [];
    landRecords.forEach(record => {
      const actions = Array.isArray(record.action_log) ? record.action_log : [];
      actions.forEach(action => {
        allActions.push({
          land_record_id: record.id,
          parcel_number: record.parcel_number,
          ...action,
          changed_at: new Date(action.changed_at) 
        });
      });
    });

    
    allActions.sort((a, b) => b.changed_at - a.changed_at);
    
    
    const recentActions = allActions.slice(0, parseInt(limit)).map(action => ({
      ...action,
      changed_at: action.changed_at.toISOString()
    }));

    res.status(200).json({
      success: true,
      data: recentActions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error fetching recent actions: ${error.message}`
    });
  }
};

const changeRecordStatus = async (req, res) => {
  try {
    const { record_status, notes, rejection_reason } = req.body;
    const { id: recordId } = req.params;
    const user = req.user;

    if (!record_status) {
      return res.status(400).json({ status: "error", message: "Record status is required" });
    }

    // Get the land record with current status BEFORE updating
    const landRecordBeforeUpdate = await LandRecord.findByPk(recordId, {
      include: [{
        model: Document,
        as: 'documents',
        attributes: ['plot_number']
      }]
    });

    if (!landRecordBeforeUpdate) {
      return res.status(404).json({ status: "error", message: "Land record not found" });
    }

    const previousStatus = landRecordBeforeUpdate.record_status;
    const plotNumber = landRecordBeforeUpdate?.documents?.[0]?.plot_number || null;

    // Update the record status
    const updatedRecord = await changeRecordStatusService(
      recordId,
      record_status,
      user.id,
      { notes, rejection_reason }
    );

    // Trigger  and Notification
    try {
      const io = req.app.get('io');
      const { notifyNewAction } = require('../utils/notificationUtils');
      
      if (io && notifyNewAction) {
        await notifyNewAction(io, {
          landRecordId: landRecordBeforeUpdate.id,
          parcelNumber: landRecordBeforeUpdate.parcel_number,
          action_type: `STATUS_${record_status}`,
          performed_by: user.id,
          administrative_unit_id: landRecordBeforeUpdate.administrative_unit_id,
          notes: notes || `Status changed from ${previousStatus} to ${record_status}`,
          additional_data: {
            status: record_status,
            previous_status: previousStatus, 
            rejection_reason: rejection_reason,
            changed_by_name: `${user.first_name} ${user.middle_name}`,
            plot_number: plotNumber 
          }
        });
      }
    } catch (notificationError) {
throw new Error(`Notification error: ${notificationError.message}`);
    }

    res.status(200).json({
      status: "success",
      message: `Record status updated to ${record_status}`,
      data: updatedRecord,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const moveToTrash = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;
    const { deletion_reason } = req.body;

    if (!deletion_reason) {
      throw new Error("የመሰረዝ ምክንያት ያስፈልጋል።");
    }

    const result = await moveToTrashService(id, user, deletion_reason, {
      transaction: t,
    });

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ወደ መጥፎ ቅርጫት ተዛውሯል",
      data: result,
    });
  } catch (error) {
    await t.rollback();
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const restoreFromTrash = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

    const result = await restoreFromTrashService(id, user, {
      transaction: t,
    });

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ከመጥፎ ቅርጫት ተመልሷል",
      data: result,
    });
  } catch (error) {
    await t.rollback();
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const permanentlyDelete = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;

    await permanentlyDeleteService(id, user);

    await t.commit();
    res.status(200).json({
      status: "success",
      message: "መዝገብ ለዘላለም ተሰርዟል",
    });
  } catch (error) {
    await t.rollback();
    
    const statusCode = error.message.includes("አልተገኘም") ? 404 : 
                     error.message.includes("Validation") ? 422 : 400;
    
    res.status(statusCode).json({
      status: "error",
      message: error.message.replace(/Validation error: /, ""),
    });
  }
};
const getTrash = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const user = req.user;

    const result = await getTrashItemsService(user, { page, limit });

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};
const getLandRecordStatsController = async (req, res, next) => {
  try {
    
    const adminUnitId = req.user.administrative_unit_id || null;

    
    const options = {};
    if (req.transaction) options.transaction = req.transaction;

    const stats = await getLandRecordStats(adminUnitId, options);

    res.status(200).json({
      status: "success", 
      message: "የመሬት መዝገብ ስታቲስቲክስ በተሳካ ሁኔታ ተገኝቷል።",
      data: stats,
    });
  } catch (error) {
    res.status(400).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  moveToTrash,
  getLandRecordStatsController,
  restoreFromTrash,
  getLandBankRecords,
  permanentlyDelete,
  getTrash,
  createLandRecord,
  importLandRecordsFromXLSX,
  getAllLandRecords,
  changeRecordStatus,
  getRejectedLandRecords,
  getLandRecordById,
  getMyLandRecords,
  getLandRecordByUserId,
  getLandRecordsByCreator,
  updateLandRecord,
  getLandRecordsByUserAdminUnit,
  getRecentActions,
  getFilterOptions,
  getLandRecordsStats,
};
