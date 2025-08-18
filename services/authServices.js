const {
  sequelize,
  User,
  Role,
  AdministrativeUnit,
  Region,
  Zone,
  Woreda,
  OversightOffice,
} = require("../models");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sendPasswordResetEmail } = require("../utils/mailService");
const nodemailer = require('nodemailer');


const registerOfficial = async (data, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    if (
      !data.first_name ||
      !data.last_name ||
      !data.middle_name ||
      !data.phone_number ||
      !data.national_id ||
      !data.role_id
    ) {
      throw new Error(
        "ስም፣ የአባት ስም፣ የአያት ስም፣ ብሔራዊ መታወቂያ፣ ሚና፣ ስልክ ቁጥር፣ ኢሜል መግለጽ አለባቸው።"
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
    //validate Administrative Unit(optional)
    if (data.administrative_unit_id) {
      const administrativeUnit = await AdministrativeUnit.findByPk(
        data.administrative_unit_id,
        {
          transaction: t,
        }
      );
      if (!administrativeUnit) {
        throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
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

const login = async ({ email, password }, options = {}) => {
  // Use provided transaction or create new one
  const t = options.transaction || await sequelize.transaction();
  const shouldCommit = !options.transaction; // Only commit if we created the transaction

  try {
    // Validate inputs
    if (!email) throw new Error("ኢሜል ያስፈልጋል");
    if (!password) throw new Error("የይለፍ ቃል ያስፈልጋል");

    // Find user with transaction
    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      include: [{ model: Role, as: "role", attributes: ["id", "name"] }],
      transaction: t,
      attributes: ['id', 'first_name','middle_name', 'last_name', 'phone_number','middle_name','email','national_id', 'password', 'otp', 'otpExpiry', 'isFirstLogin']
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error("የተሳሳተ የይለፍ ቃል");

    // First-time login flow
    if (user.isFirstLogin) {
      await sendOTP(user.email, { transaction: t });
      
      if (shouldCommit) await t.commit();
      return { 
        success: true, 
        message: "OTP ወደ ኢሜልዎ ተልኳል። እባክዎ ያረጋግጡ።",
        requiresOTPVerification: true 
      };
    }

    // Regular login flow
    await user.update({ last_login: new Date() }, { transaction: t });

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role?.name,
        administrative_unit_id: user.administrative_unit_id,
        oversight_office_id: user.oversight_office_id 
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    if (shouldCommit) await t.commit();
    return { 
      token, 
      user: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role?.name,
        isFirstLogin: user.isFirstLogin,
        national_id: user.national_id,
        administrative_unit_id: user.administrative_unit_id,
      },
      message: "በተሳካ ሁኔታ ገብተዋል"
    };
  } catch (error) {
    if (shouldCommit && !t.finished) await t.rollback();
    throw error;
  }
};

const sendOTP = async (email, options = {}) => {
  const t = options.transaction || await sequelize.transaction();
  const shouldCommit = !options.transaction;

  try {
    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      transaction: t,
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    
    // Check if previous OTP is still valid (not expired)
    const now = new Date();
    if (user.otpExpiry && user.otpExpiry > now) {
      const remainingSeconds = Math.ceil((user.otpExpiry - now) / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      throw new Error(
      `እባክዎ ያለፈውን OTP ይጠቀሙ ወይም ከ${remainingMinutes} ደቂቃና ${seconds} ሰከንድ በኋላ እንደገና ይሞክሩ`
      );
    }

    // Generate and save new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("Generated OTP:", otp); 
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000); 
    await user.update({ otp, otpExpiry }, { transaction: t });

    // Send OTP email (same as before)
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'የእርስዎ OTP ኮድ',
      html: `
      <div style="background:linear-gradient(135deg,#e0e7ff 0%,#f0fdf4 100%);padding:32px;border-radius:16px;max-width:400px;margin:auto;font-family:'Segoe UI',Arial,sans-serif;">
        <h2 style="color:#2563eb;text-align:center;margin-bottom:16px;">OTP ኮድ ለመግባት</h2>
        <p style="font-size:18px;color:#334155;text-align:center;">እንኳን ደህና መጡ!</p>
        <div style="background:#f1f5f9;padding:24px;border-radius:12px;margin:24px 0;text-align:center;">
        <span style="font-size:32px;letter-spacing:8px;color:#059669;font-weight:bold;">${otp}</span>
        <p style="color:#64748b;margin-top:8px;">ይህ ኮድ ለ <strong style="color:#2563eb;">5 ደቂቃ</strong> ብቻ ይሰራል።</p>
        </div>
        <p style="color:#475569;text-align:center;">እባክዎ ይህን ኮድ በመግባት ገፅ ያስገቡ።</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="text-align:center;color:#64748b;">እናመሰግናለን!<br>ቲምዎርክ አይቲ ሶሊውሽን</p>
      </div>
      `,
    });

    if (shouldCommit) await t.commit();
    return { success: true, message: "OTP በትክክል ተልኳል" };
  } catch (error) {
    if (shouldCommit && !t.finished) await t.rollback();
    throw error;
  }
};

const resendOTP = async (email, options = {}) => {
  const t = options.transaction || await sequelize.transaction();
  const shouldCommit = !options.transaction;

  try {
    if (!email) throw new Error("ኢሜል ያስፈልጋል");

    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      transaction: t,
      attributes: ['id', 'email', 'isFirstLogin', 'otp', 'otpExpiry']
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    
    // Check if previous OTP is still valid
    const now = new Date();
    if (user.otpExpiry && user.otpExpiry > now) {
      const remainingSeconds = Math.ceil((user.otpExpiry - now) / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      throw new Error(
      `ያለፈው OTP አሁንም የሚሰራ ነው። ከ${remainingMinutes} ደቂቃና ${seconds} ሰከንድ በኋላ እንደገና ይሞክሩ`
      );
    }

    if (!user.isFirstLogin) {
      throw new Error("OTP የሚልክበት ለመጀመሪያ ጊዜ የገባ ተጠቃሚ ነው");
    }

    await sendOTP(user.email, { transaction: t });
    
    if (shouldCommit) await t.commit();
    return { 
      success: true, 
      message: "አዲስ OTP ወደ ኢሜልዎ ተልኳል። እባክዎ ያረጋግጡ።",
      requiresOTPVerification: true 
    };
  } catch (error) {
    if (shouldCommit && !t.finished) await t.rollback();
    throw error;
  }
};
const verifyOTP = async ({ email, otp }, options = {}) => {
  const t = options.transaction || await sequelize.transaction();
  const shouldCommit = !options.transaction;

  try {
    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      include: [{ model: Role, as: "role" }],
      transaction: t,
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    if (!user.otp ) throw new Error("OTP አልተጠየቀም");
    if (user.otpExpiry < new Date()) throw new Error("OTP ጊዜው አልፎታል");
    if (user.otp !== otp) throw new Error("የተሳሳተ OTP");

    // Complete verification
    await user.update({
      isFirstLogin: false,
      last_login: new Date(),
      otp: null,
      otpExpiry: null
    }, { transaction: t });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role?.name,
        administrative_unit_id: user.administrative_unit_id,
        oversight_office_id: user.oversight_office_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    if (shouldCommit) await t.commit();
    return {
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        middle_name: user.middle_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role?.name,
      },
      message: "OTP በትክክል ተረጋግጧል"
    };
  } catch (error) {
    if (shouldCommit && !t.finished) await t.rollback();
    console.error("የOTP ማረጋገጫ ስህተት:", error);
    throw error;
  }
};
// logoute service
const logoutService = async (userId, options = {}) => {
  const { transaction } = options;
  try {
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
      userId: user.id, 
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Save token to DB
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();

  // Send email
  await sendPasswordResetEmail(user.email, user.name, resetToken);

  return { success: true, message: "የሪሴት ሊንክ ወደ ኢሜልዎ ተልኳል" };
};

const resetPasswordService = async (token, newPassword) => {
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      // Check for userId instead of id
      throw new Error("Invalid token: missing user ID");
    }

    // Find user with valid token
    const user = await User.findOne({
      where: {
        id: decoded.userId, // Use userId here
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: Date.now() },
      },
    });

    if (!user) throw new Error("Invalid or expired token");

    // Proceed with password update
    await user.update({
      password: newPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null,
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
    // Check old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      throw new Error("የተሳሳተ የይለፍ ቃል።");
    }
    // Hash and update new password
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
  verifyOTP,
  sendOTP,
  resendOTP,
  logoutService,
  forgotPasswordService,
};
