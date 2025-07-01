const jwt = require("jsonwebtoken");
const { User, Role } = require("../models");

const protect = async (req, res, next) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const error = new Error("የተጠቃሚ መረጃ አልተገኘም። እባክዎ ትክክለኛ የJWT ማስመሰያ ያክሉ።");
      error.status = 401;
      throw error;
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      console.error("JWT verification error:", { error: err.message, token });
      const error = new Error("የማስመሰያ መረጃ ልክ አይደለም። ማስመሰያ ልክ ያልሆነ ወይም ጊዜው ያለፈበት ነው።");
      error.status = 401;
      throw error;
    }

    // Validate decoded token
    if (!decoded.id) {
      const error = new Error("የማስመሰያ መረጃ ልክ አይደለም። የተጠቃሚ መለያ ቁጥር ይጎድላል።");
      error.status = 401;
      throw error;
    }

    // Fetch user with role and administrative unit
    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "email", "phone_number", "full_name", "role_id", "is_active", "administrative_unit_id", "primary_owner_id"],
      include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
    });

    if (!user || !user.is_active) {
      const error = new Error(`ተጠቃሚ ከመለያ ቁጥር ${decoded.id} ጋር አልተገኘም ወይም እንቅስቃሴ-አልባ ነው።`);
      error.status = 401;
      throw error;
    }

    // Allow co-owners (landowners without roles) to bypass admin unit check
    if (!user.role_id && !user.administrative_unit_id) {
      const error = new Error("ተጠቃሚው አስተዳደራዊ ክፍል መግለጽ አለበት።");
      error.status = 403;
      throw error;
    }

    // Attach user data to request
    req.user = {
      id: user.id,
      email: user.email,
      phone_number: user.phone_number,
      full_name: user.full_name,
      role: user.role ? user.role.name : null,
      administrative_unit_id: user.administrative_unit_id,
      is_co_owner: !!user.primary_owner_id,
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
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "የተጠቃሚ መረጃ አልተገኘም። እባክዎ መጀመሪያ ይግቡ።",
      });
    }

    // Allow co-owners limited access if explicitly permitted
    if (req.user.is_co_owner && allowedRoles.includes("co_owner")) {
      return next();
    }

    // Check role-based access for officials
    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `የተከለከለ መዳረሻ። የ${allowedRoles.join(" ወይም ")} ሚና ብቻ ይህን እርምጃ መፈጸም ይችላል።`,
      });
    }

    next();
  };
};

module.exports = { protect, restrictTo };