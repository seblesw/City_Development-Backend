const jwt = require("jsonwebtoken");

// Lazy-load models to avoid circular dependency
const getModels = () => require("../models");

const protect = async (req, res, next) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw Object.assign(new Error("የተጠቃሚ መረጃ አልተገኘም። እባክዎ ትክክለኛ የJWT ማስመሰያ ያክሉ።"), { status: 401 });
    }

    // Extract and verify token
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret");
    if (!decoded.id) {
      throw Object.assign(new Error("የማስመሰያ መረጃ ልክ አይደለም። የተጠቃሚ መለያ ቁጥር ይጎድላል።"), { status: 401 });
    }

    // Fetch user with role
    const { User, Role } = getModels();
    const user = await User.findByPk(decoded.id, {
      attributes: [
        "id",
        "first_name",
        "middle_name",
        "last_name",
        "email",
        "phone_number",
        "role_id",
        "is_active",
        "administrative_unit_id",
        "oversight_office_id",
      ],
      include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
    });

    // if (!user || !user.is_active) {
    //   throw Object.assign(new Error(`ተጠቃሚ ከመለያ ቁጥር ${decoded.id} `), { status: 401 });
    // }

    // Attach user data to request
    req.user = {
      id: user.id,
      first_name: user.first_name,
      middle_name: user.middle_name || null,
      last_name: user.last_name,
      email: user.email,
      phone_number: user.phone_number,
      role_id: user.role_id,
      role_name: user.role ? user.role.name : null,
      administrative_unit_id: user.administrative_unit_id || null,
      oversight_office_id: user.oversight_office_id || null,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", { error: error.message });
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



    // Check role-based access for officials
    if (!req.user.role_name || !allowedRoles.includes(req.user.role_name)) {
      return res.status(403).json({
        success: false,
        message: `የተከለከለ መዳረሻ። የ${allowedRoles.join(" ወይም ")} ሚና ብቻ ይህን እርምጃ መፈጸም ይችላል።`,
      });
    }

    next();
  };
};

module.exports = { protect, restrictTo };