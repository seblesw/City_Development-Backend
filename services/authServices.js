const {
  sequelize,
  User,
  Role,
  AdministrativeUnit,
  OversightOffice,
} = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendPasswordResetEmail } = require("../utils/mailService");

const registerOfficial = async (data, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    // Basic required fields check
    console.log("Registering official with data:", data);
    if (
      !data.first_name ||
      !data.last_name ||
      !data.middle_name ||
      !data.email ||
      !data.phone_number ||
      !data.national_id ||
      !data.administrative_unit_id ||
      !data.role_id ||
      !data.gender
    ) {
      throw new Error(
        "ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ የአስተዳደር ክፍል፣ ሚና፣ እና ጾታ መግለጽ አለባቸው።"
      );
    }

    t = t || (await sequelize.transaction());
    // Validate Oversight Office (optional)
    if (data.oversight_office_id) {
      const office = await OversightOffice.findByPk(data.oversight_office_id, {
        transaction: t,
      });
      if (!office) {
        throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ።");
      }
    }

    // Check for unique email (if provided)
    if (data.email) {
      const existingEmail = await User.findOne({
        where: { email: data.email, deletedAt: { [Op.eq]: null } },
        transaction: t,
      });
      if (existingEmail) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Check for unique phone_number (if provided)
    if (data.phone_number) {
      const existingPhone = await User.findOne({
        where: {
          phone_number: data.phone_number,
          deletedAt: { [Op.eq]: null },
        },
        transaction: t,
      });
      if (existingPhone) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Check for unique national_id
    const existingNationalId = await User.findOne({
      where: { national_id: data.national_id, deletedAt: { [Op.eq]: null } },
      transaction: t,
    });
    if (existingNationalId) {
      throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
    }

    //  Default password if not provided
    const rawPassword = data.password || "12345678";
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Create user
    const official = await User.create(
      {
        ...data,
        password: hashedPassword,
      },
      { transaction: t }
    );

    if (!transaction) await t.commit();

    return official;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ባለሥልጣን መፍጠር ስህተት: ${error.message}`);
  }
};

const login = async ({ email, phone_number, password }, options = {}) => {
  const { transaction } = options;
  try {
    const user = await User.findOne({
      where: {
        [Op.or]: [{ email }, { phone_number }],
        deletedAt: { [Op.eq]: null },
      },
      include: [{ model: Role, as: "role" }],
      transaction,
    });
    if (!user) {
      throw new Error("ተጠቃሚ አልተገኘም።");
    }
    if (!user.password || !(await user.validatePassword(password))) {
      throw new Error("የተሳሳተ የይለፍ ቃል።");
    }
    if (!user.is_active) {
      throw new Error("ተጠቃሚው ንቁ አይደለም።");
    }

    // Update last_login
    await user.update({ last_login: new Date() }, { transaction });

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role?.name },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "1d" }
    );

    return {
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        middle_name: user.middle_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role?.name,
        administrative_unit_id: user.administrative_unit_id,
        oversight_office_id: user.oversight_office_id,
        national_id: user.national_id,
        is_active: user.is_active,
        last_login: user.last_login,
      },
      token,
    };
  } catch (error) {
    throw new Error(`መግባት ስህተት: ${error.message}`);
  }
};
// logoute service
const logoutService = async (userId, options = {}) => {
  const { transaction } = options;
  try {
    // Here you can implement the logic to invalidate the user's session or token
    // For example, if you're using JWT, you might want to blacklist the token
    // or simply remove it from the client side.

    // If you have a session store, you can destroy the session here.

    return { message: "በተሳካ ሁኔታ ወጣል።" };
  } catch (error) {
    throw new Error(`መውጫ ስህተት: ${error.message}`);
  }
};
//forgot password service
const forgotPasswordService = async (email) => {
  if (!email) throw new Error("Email is required.");

  const user = await User.findOne({
    where: {
      email: email,
      deletedAt: null, 
    },
  });
  if (!user) throw new Error("User not found.");

  // Generate JWT token (expires in 1h)
const resetToken = jwt.sign(
  { 
    userId: user.id,  // Use consistent naming (userId instead of just id)
    email: user.email 
  },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);

  // Save token to DB
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1h
  await user.save();

  // Send email
  await sendPasswordResetEmail(user.email, user.name, resetToken);

  return { success: true, message: "Reset link sent to email." };
};

const resetPasswordService = async (token, newPassword) => {
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.userId) {  // Check for userId instead of id
      throw new Error("Invalid token: missing user ID");
    }

    // Find user with valid token
    const user = await User.findOne({
      where: {
        id: decoded.userId,  // Use userId here
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: Date.now() }
      }
    });

    if (!user) throw new Error("Invalid or expired token");

    // Proceed with password update
    await user.update({
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    return { success: true, message: "Password reset successful" };
    
  } catch (error) {
    console.error("Reset error:", error);
    throw new Error(`Reset failed: ${error.message}`);
  }
};

const changePasswordService = async (
  userId,
  oldPassword,
  newPassword,
  options = {}
) => {
  const { transaction } = options;
  try {
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      throw new Error("ተጠቃሚው አልተገኘም።");
    }
    if (!(await user.validatePassword(oldPassword))) {
      throw new Error("የተሳሳተ የይለፍ ቃል።");
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedNewPassword }, { transaction });

    return { message: "የይለፍ ቃል በተሳካ ሁኔታ ተመለውጧል።" };
  } catch (error) {
    throw new Error(`የይለፍ ቃል መለወጫ ስህተት: ${error.message}`);
  }
};

module.exports = {
  registerOfficial,
  changePasswordService,
  resetPasswordService,
  login,
  logoutService,
  forgotPasswordService,
};
