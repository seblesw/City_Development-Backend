const { ActionLog, User, LandRecord } = require("../models");
const { Op, Sequelize } = require("sequelize");

const getActionLog = async (req, res) => {
  try {
    const { landRecordId } = req.params;
    const action_logs = await ActionLog.findAll({
      where: {
        land_record_id: landRecordId,
      },
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
    
    res.status(200).json({
      actions: action_logs,
      message: 'Action logs fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching action logs:', error);
    res.status(500).json({
      message: 'Error fetching action logs',
      error: error.message
    });
  }
};

const getAllActionLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      performer,
      action_type,
      time_filter,
      land_record_id,
      start_date,
      end_date,
      search
    } = req.query;

    // Get admin_unit_id from logged-in user
    const userAdminUnitId = req.user.administrative_unit_id;
    
    if (!userAdminUnitId) {
      return res.status(403).json({
        message: 'Access denied. User does not belong to any administrative unit.'
      });
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions - ALWAYS filter by admin_unit_id
    const whereConditions = {
      admin_unit_id: userAdminUnitId
    };

    // Filter by performer
    if (performer) {
      whereConditions.performed_by = performer;
    }

    // Filter by action type
    if (action_type) {
      whereConditions.action_type = action_type;
    }

    // Filter by land record
    if (land_record_id) {
      whereConditions.land_record_id = land_record_id;
    }

    // Filter by time period
    if (time_filter) {
      const now = new Date();
      let startDate;

      switch (time_filter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'this_week':
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'this_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'last_week':
          startDate = new Date(now.setDate(now.getDate() - now.getDay() - 7));
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'last_month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          break;
        default:
          // No time filter applied
          break;
      }

      if (startDate) {
        whereConditions.createdAt = {
          [Op.gte]: startDate
        };
      }
    }

    // Custom date range filter
    if (start_date && end_date) {
      whereConditions.createdAt = {
        [Op.between]: [new Date(start_date), new Date(end_date)]
      };
    } else if (start_date) {
      whereConditions.createdAt = {
        [Op.gte]: new Date(start_date)
      };
    } else if (end_date) {
      whereConditions.createdAt = {
        [Op.lte]: new Date(end_date)
      };
    }

    // Search in notes and additional_data
    if (search) {
      whereConditions[Op.or] = [
        { notes: { [Op.iLike]: `%${search}%` } }, 
        { '$additional_data.plot_number$': { [Op.iLike]: `%${search}%` } },
        { '$additional_data.parcel_number$': { [Op.iLike]: `%${search}%` } },
        { '$additional_data.changed_by_name$': { [Op.iLike]: `%${search}%` } }
      ];
    }

    // Get total count for pagination
    const totalCount = await ActionLog.count({
      where: whereConditions
    });

    // Fetch action logs with pagination and filters
    const actions = await ActionLog.findAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['id', 'first_name', 'last_name', 'email']
        },
        // Optional: Include LandRecord if needed
        {
          model: LandRecord,
          as: 'landRecord',
          attributes: ['id', 'parcel_number']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: limitNum,
      offset: offset
    });

    // Get unique performers for filter dropdown - ONLY from same admin unit
    const performers = await User.findAll({
      attributes: ['id', 'first_name', 'last_name'], // Fixed: removed middle_name if not needed
      include: [
        {
          model: ActionLog,
          as: 'performedActions',
          attributes: [],
          required: true,
          where: {
            admin_unit_id: userAdminUnitId
          }
        }
      ],
      group: ['User.id', 'User.first_name', 'User.last_name'], // Fixed: use last_name instead of middle_name
      raw: true
    });

    // Get unique action types for filter dropdown - ONLY from same admin unit
    const actionTypes = await ActionLog.findAll({
      attributes: ['action_type'],
      where: {
        admin_unit_id: userAdminUnitId
      },
      group: ['action_type'],
      raw: true
    });

    return res.status(200).json({
      actions,
      pagination: {
        current_page: pageNum,
        total_pages: Math.ceil(totalCount / limitNum),
        total_items: totalCount,
        items_per_page: limitNum,
        has_next: pageNum < Math.ceil(totalCount / limitNum),
        has_prev: pageNum > 1
      },
      filters: {
        performers: performers.map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`
        })),
        action_types: actionTypes.map(a => a.action_type)
      },
      message: 'Action logs fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching action logs:', error);
    res.status(500).json({
      message: 'Error fetching action logs',
      error: error.message
    });
  }
};

const getActionLogStats = async (req, res) => {
  try {
    const { time_filter, performer } = req.query;

    // Get admin_unit_id from logged-in user
    const userAdminUnitId = req.user.administrative_unit_id;
    
    if (!userAdminUnitId) {
      return res.status(403).json({
        message: 'Access denied. User does not belong to any administrative unit.'
      });
    }

    const whereConditions = {
      admin_unit_id: userAdminUnitId
    };
    
    // Apply time filter if provided
    if (time_filter) {
      const now = new Date();
      let startDate;

      switch (time_filter) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'this_week':
          startDate = new Date(now.setDate(now.getDate() - now.getDay()));
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'this_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          break;
      }

      if (startDate) {
        whereConditions.createdAt = {
          [Op.gte]: startDate
        };
      }
    }

    // Filter by performer if provided
    if (performer) {
      whereConditions.performed_by = performer;
    }

    // Get total count
    const totalActions = await ActionLog.count({ where: whereConditions });

    // Get actions by type - FIXED QUERY
    const actionsByType = await ActionLog.findAll({
      attributes: [
        'action_type',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: whereConditions,
      group: ['action_type'],
      raw: true
    });

    // Get actions by performer - FIXED QUERY
    const actionsByPerformer = await ActionLog.findAll({
      attributes: [
        'performed_by',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']
      ],
      where: whereConditions,
      group: ['performed_by'],
      raw: true
    });

    // Get user details for performers
    const performerDetails = await User.findAll({
      where: {
        id: actionsByPerformer.map(ap => ap.performed_by)
      },
      attributes: ['id', 'first_name', 'last_name'],
      raw: true
    });

    // Map performer details to counts
    const actionsByPerformerWithNames = actionsByPerformer.map(ap => {
      const performerDetail = performerDetails.find(p => p.id === ap.performed_by);
      return {
        performer_id: ap.performed_by,
        performer_name: performerDetail ? 
          `${performerDetail.first_name} ${performerDetail.last_name}` : 
          'Unknown User',
        count: ap.count
      };
    });

    // Get recent activity
    const recentActivity = await ActionLog.findAll({
      where: whereConditions,
      include: [
        {
          model: User,
          as: 'performedBy',
          attributes: ['first_name', 'last_name']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 5
    });

    res.status(200).json({
      stats: {
        total_actions: totalActions,
        actions_by_type: actionsByType,
        actions_by_performer: actionsByPerformerWithNames,
        recent_activity: recentActivity
      },
      message: 'Action log statistics fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching action log stats:', error);
    res.status(500).json({
      message: 'Error fetching action log statistics',
      error: error.message
    });
  }
};

// Alternative simplified version without complex grouping - UPDATED with admin unit filter
const getActionLogFilters = async (req, res) => {
  try {
    // Get admin_unit_id from logged-in user
    const userAdminUnitId = req.user.administrative_unit_id;
    
    if (!userAdminUnitId) {
      return res.status(403).json({
        message: 'Access denied. User does not belong to any administrative unit.'
      });
    }

    // Get all performers who have action logs in the same admin unit
    const performers = await User.findAll({
      attributes: ['id', 'first_name', 'last_name'],
      include: [
        {
          model: ActionLog,
          as: 'performedActions',
          attributes: [],
          where: {
            admin_unit_id: userAdminUnitId
          },
          required: true
        }
      ],
      group: ['User.id', 'User.first_name', 'User.last_name'],
      raw: true
    });

    // Get all action types from the same admin unit
    const actionTypes = await ActionLog.findAll({
      attributes: ['action_type'],
      where: {
        admin_unit_id: userAdminUnitId
      },
      group: ['action_type'],
      raw: true
    });

    res.status(200).json({
      filters: {
        performers: performers.map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`
        })),
        action_types: actionTypes.map(a => a.action_type)
      },
      message: 'Filter options fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};

module.exports = {
  getActionLog,
  getAllActionLogs,
  getActionLogStats,
  getActionLogFilters
};