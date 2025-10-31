// services/OwnershipTransferService.js

const { OwnershipTransfer, Sequelize, sequelize } = require("../models");
const { Op } = require("sequelize");
const path = require("path");
const fs = require("fs");

const CreateTransferService = async (data, adminUnitId, userId) => {
  const t = await sequelize.transaction();

  try {
    // STEP 1: Extract all required data from request
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
      plot_number,
      parcel_number,
      property_location,
      transceiver_full_name,
      transceiver_phone,
      transceiver_email,
      transceiver_nationalid,
      recipient_full_name,
      recipient_phone,
      recipient_email,
      recipient_nationalid,
      uploadedFiles = [],
    } = data;

    // STEP 2: Validate required fields
    if (
      !transceiver_full_name ||
      !transceiver_phone ||
      !recipient_full_name ||
      !recipient_phone
    ) {
      throw new Error("Required fields are missing");
    }

    // STEP 3: Validate SALE_OR_GIFT_SUB - only required if transfer type is SALE_OR_GIFT
    if (transfer_type === "በሽያጭ ወይም በስጦታ" && !sale_or_gift_sub) {
      throw new Error(
        "Sale or gift sub-type is required for sale or gift transfers"
      );
    }

    // STEP 4: Check if transfer is free inheritance (parent ↔ child)
    const isFreeTransfer =
      transfer_type === "በውርስ የተገኘ" &&
      (inheritance_relation === "ከልጅ ወደ ወላጅ" ||
        inheritance_relation === "ከወላጅ ወደ ልጅ");

    // STEP 5: Validate rates for non-free inheritance transfers
    if (!isFreeTransfer) {
      if (!service_rate || !tax_rate) {
        throw new Error(
          "Service rate and tax rate are required for non-inheritance transfers"
        );
      }

      const serviceRateVal = parseFloat(service_rate);
      const taxRateVal = parseFloat(tax_rate);

      if (serviceRateVal < 0 || serviceRateVal > 100) {
        throw new Error("Service rate must be between 0 and 100");
      }

      if (taxRateVal < 0 || taxRateVal > 100) {
        throw new Error("Tax rate must be between 0 and 100");
      }
    }

    // STEP 6: Prepare calculation data - set zero rates for free transfers
    const calculationData = { ...data };
    if (isFreeTransfer) {
      calculationData.service_rate = 0;
      calculationData.tax_rate = 0;
    }

    // STEP 7: Extract calculation parameters
    const { service_rate: calc_service_rate, tax_rate: calc_tax_rate } =
      calculationData;

    // STEP 8: Convert rates from percentage to decimal for calculation
    const serviceRateDecimal = parseFloat(calc_service_rate) / 100;
    const taxRateDecimal = parseFloat(calc_tax_rate) / 100;

    // STEP 9: Parse numeric values with safe defaults
    const area = parseFloat(property_area) || 0;
    const landRate = parseFloat(land_value) || 0;
    const buildingVal = parseFloat(building_value) || 0;

    // STEP 10: Calculate base property value
    const baseValue = landRate * area + buildingVal;

    // STEP 11: Calculate individual fees
    const serviceFee = baseValue * serviceRateDecimal;
    const taxAmount = baseValue * taxRateDecimal;
    const totalPayable = serviceFee + taxAmount;

    // STEP 12: Prepare fee calculation results with proper rounding
    const feeCalculation = {
      baseValue: parseFloat(baseValue.toFixed(2)),
      serviceFee: parseFloat(serviceFee.toFixed(2)),
      taxAmount: parseFloat(taxAmount.toFixed(2)),
      totalPayable: parseFloat(totalPayable.toFixed(2)),
      serviceRate: serviceRateDecimal * 100,
      taxRate: taxRateDecimal * 100,
    };

    // STEP 13: Process uploaded files - FIXED VERSION
    const fileMetadata = [];
    if (Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
      for (const file of uploadedFiles) {
        // Verify file actually exists on disk
        if (!fs.existsSync(file.path)) {
          console.warn("File not found on disk:", file.path);
          continue; // Skip files that don't exist
        }

        // Use serverRelativePath from multer or create it
        const serverRelativePath =
          file.serverRelativePath || `uploads/documents/${file.filename}`;

        fileMetadata.push({
          file_path: serverRelativePath,
          file_name: file.originalname || `document_${Date.now()}.pdf`,
          mime_type: file.mimetype || "application/octet-stream",
          file_size: file.size || 0,
          uploaded_at: new Date().toISOString(),
          uploaded_by: userId,
          file_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        });
      }
    }

    // STEP 14: Prepare complete transfer data for database
    const transferData = {
      // Property Information
      property_use,
      transfer_type,
      sale_or_gift_sub,
      inheritance_relation,
      plot_number,
      parcel_number,
      land_area: parseFloat(property_area) || null,
      land_value: parseFloat(land_value) || null,
      building_value: parseFloat(building_value) || null,
      property_location,

      // Fee Information
      base_value: feeCalculation.baseValue,
      service_fee: feeCalculation.serviceFee,
      service_rate: feeCalculation.serviceRate,
      tax_amount: feeCalculation.taxAmount,
      tax_rate: feeCalculation.taxRate,
      total_payable: feeCalculation.totalPayable,

      // Transceiver (Sender) Information
      transceiver_full_name,
      transceiver_phone: transceiver_phone.toString(),
      transceiver_email,
      transceiver_nationalid,

      // Recipient Information
      recipient_full_name,
      recipient_phone: recipient_phone.toString(),
      recipient_email,
      recipient_nationalid,

      // System Information
      administrative_unit_id: adminUnitId,
      created_by: userId,
      updated_by: userId,

      // File Information - store as JSON array
      file: fileMetadata.length > 0 ? fileMetadata : null,
    };

    // STEP 15: Create the ownership transfer record in database
    const ownershipTransfer = await OwnershipTransfer.create(transferData, {
      transaction: t,
    });

    // STEP 16: Create audit log
    try {
      const creator = await User.findByPk(userId, {
        attributes: ["id", "first_name", "middle_name", "last_name"],
        transaction: t,
      });
    } catch (auditError) {
      // Continue with transaction even if audit fails
    }

    await t.commit();

    // STEP 17: Return complete transfer data
    return {
      success: true,
      message: "Ownership transfer created successfully",
      data: ownershipTransfer,
    };
  } catch (error) {
    await t.rollback();
    console.error("CreateTransferService Error:", error);

    // Handle specific database error types
    if (error.name === "SequelizeValidationError") {
      const validationErrors = error.errors.map((err) => err.message);
      throw new Error(`Validation failed: ${validationErrors.join(", ")}`);
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      throw new Error("A transfer with similar details already exists");
    }

    throw new Error(`Failed to create ownership transfer: ${error.message}`);
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
    const transfer = await OwnershipTransfer.findOne({
      where: { id, administrative_unit_id: adminUnitId },
    });

    if (!transfer) {
      return null;
    }

    // Convert to plain object to work with
    const result = transfer.get({ plain: true });

    // Add file URLs - files are in /uploads/documents/
    if (result.file && Array.isArray(result.file)) {
      result.file = result.file.map((fileItem) => ({
        ...fileItem,
        // Direct URL to files in /uploads/documents/
        file_url: `${
          process.env.BASE_URL || "http://localhost:3000"
        }/uploads/documents/${fileItem.storedName}`,
      }));
    }

    return result;
  } catch (error) {
    console.error("GetTransferByIdService Error:", error);
    throw new Error("Failed to fetch transfer");
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

// services/ownershipTransferService.js - UPDATED

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
};
