const jwt = require("jsonwebtoken");
const { User, Role } = require("../models");

const protect = async (req, res, next) => {
  try {
    // Check for Authorization header
    if (!req.headers.authorization || !req.headers.authorization.startsWith("Bearer ")) {
      const error = new Error("የተጠቃሚ መረጃ አልተገኘም። እባክዎ ትክክለኛ የJWT ማስመሰያ ያክሉ።");
      error.status = 401;
      throw error;
    }

    // Verify token
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.userId) {
      const error = new Error("የማስመሰያ መረጃ ልክ አይደለም።");
      error.status = 401;
      throw error;
    }

    // Fetch user with role and administrative_unit_id
    const user = await User.findByPk(decoded.userId, {
      attributes: ["id", "email", "full_name", "role_id", "is_active", "administrative_unit_id"],
      include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
    });

    if (!user || !user.is_active) {
      const error = new Error(`ተጠቃሚ ከመለያ ቁጥር ${decoded.userId} ጋር አልተገኘም ወይም እንቅስቃሴ-አልባ ነው።`);
      error.status = 401;
      throw error;
    }

    if (!user.administrative_unit_id) {
      const error = new Error("ተጠቃሚው አስተዳደራዊ ክፍል መግለጽ አለበት።");
      error.status = 403;
      throw error;
    }

    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role.name, // Use 'role' to match service expectation
      administrative_unit_id: user.administrative_unit_id,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", { error: error.message, stack: error.stack });
    res.status(error.status || 401).json({
      success: false,
      message: error.message || "የማስመሰያ ስህተት። እባክዎ ትክክለኛ ማስመሰያ ያክሉ።",
    });
  }
};

const restrictTo = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "የተከለከለ መዳረሻ። መዝጋቢ ብቻ መዝገብ መፍጠር ይችላል።",
      });
    }
    next();
  };
};

module.exports = { protect, restrictTo };