const {
  createLeaseAgreementService,
  getAllLeaseAgreementsService,
  getLeaseAgreementsByLandRecordIdService,
} = require("../services/leaseAgreementService");

const createLeaseAgreement = async (req, res) => {
  try {
    const user = req.user;
    const data = req.body;

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: "ፈጣሪ መለያ አልተገኘም። እባክዎ መጀመሪያ ይግቡ።",
      });
    }

    const result = await createLeaseAgreementService(data, user);
    res.status(201).json({
      success: true,
      message: "የኪራይ ስምምነት በተሳካ ሁኔታ ተፈጥሯል።",
      result,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

const getAllLeaseAgreements = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.administrative_unit_id) {
      return res.status(401).json({
        success: false,
        error: "የአስተዳደር ክፍል መለያ አልተገኘም። እባክዎ መጀመሪያ ይግቡ።",
      });
    }
    const queryParams = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };
    const result = await getAllLeaseAgreementsService(user, queryParams);
    res.status(200).json({
      success: true,
      message: "የኪራይ ስምምነቶች በተሳካ ሁኔታ ተገኝተዋል።",
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

const getLeaseAgreementsByLandRecordId = async (req, res) => {
  try {
    const user = req.user;
    const landRecordId = req.params.landRecordId;
    if (!user || !user.administrative_unit_id) {
      return res.status(401).json({
        success: false,
        error: "የአስተዳደር ክፍል መለያ አልተገኘም። እባክዎ መጀመሪያ ይግቡ።",
      });
    }
    if (!landRecordId || isNaN(landRecordId)) {
      return res.status(400).json({
        success: false,
        error: "የመሬት መዝገብ መለያ ትክክለኛ መሆን አለበት።",
      });
    }
    const queryParams = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      status: req.query.status,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };
    const result = await getLeaseAgreementsByLandRecordIdService(
      landRecordId,
      user,
      queryParams
    );
    res.status(200).json({
      success: true,
      message: "የኪራይ ስምምነቶች በተሳካ ሁኔታ ተገኝተዋል።",
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

module.exports = {
  createLeaseAgreement,
  getAllLeaseAgreements,
  getLeaseAgreementsByLandRecordId,
};
