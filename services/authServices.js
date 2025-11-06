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
const nodemailer = require('nodemailer');
// Create reusable email transporter (create once, use everywhere)
const emailTransporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Verify transporter on startup
emailTransporter.verify((error) => {
  if (error) {
    console.error('Email transporter error:', error);
  } else {
    console.log('Email transporter ready');
  }
});

const registerOfficial = async (data, options = {}) => {
  const { transaction } = options;
  let t = transaction;

  try {
    // Validation
    if (!data.first_name || !data.last_name || !data.phone_number || 
        !data.national_id || !data.role_id) {
      throw new Error("ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ ሚና፣ ስልክ ቁጥር መግለጽ አለባቸው።");
    }

    t = t || (await sequelize.transaction());

    // Batch all existence checks in parallel
    const [office, administrativeUnit, existingRecords] = await Promise.all([
      // Check office existence only if provided
      data.oversight_office_id 
        ? OversightOffice.findByPk(data.oversight_office_id, { transaction: t })
        : Promise.resolve(null),
      
      // Check administrative unit only if provided
      data.administrative_unit_id
        ? AdministrativeUnit.findByPk(data.administrative_unit_id, { transaction: t })
        : Promise.resolve(null),
      
      // Check for duplicate data in single query
      User.findOne({
        where: {
          [Op.or]: [
            data.email ? { email: data.email } : null,
            { phone_number: data.phone_number },
            { national_id: data.national_id }
          ].filter(Boolean), // Remove null entries
          deletedAt: { [Op.eq]: null }
        },
        attributes: ['email', 'phone_number', 'national_id'],
        transaction: t
      })
    ]);

    // Validate results
    if (data.oversight_office_id && !office) {
      throw new Error("ትክክለኛ የቁጥጥር ቢሮ ይምረጡ።");
    }

    if (data.administrative_unit_id && !administrativeUnit) {
      throw new Error("ትክክለኛ የአስተዳደር ክፍል ይምረጡ።");
    }

    // Check for duplicates
    if (existingRecords) {
      if (data.email && existingRecords.email === data.email) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
      if (existingRecords.phone_number === data.phone_number) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
      if (existingRecords.national_id === data.national_id) {
        throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Hash password
    const rawPassword = data.password || "12345678";
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Create user
    const official = await User.create({
      ...data,
      password: hashedPassword,
    }, { transaction: t });

    if (!transaction) await t.commit();

    return official;
  } catch (error) {
    if (!transaction && t) await t.rollback();
    throw new Error(`ባለሥልጣን መፍጠር ስህተት: ${error.message}`);
  }
};
const registerOfficialByManagerService = async (data, user) => {
  try {
    // Fast validation - check most common failures first
    if (!user.administrative_unit_id) {
      throw new Error("ማኔጅሩ አስተዳደራዊ ክፍል የለውም።");
    }

    if (!data.first_name || !data.last_name || !data.phone_number || 
        !data.national_id || !data.role_id) {
      throw new Error("ስም፣ የአባት ስም፣ ብሔራዊ መታወቂያ፣ ሚና፣ ስልክ ቁጥር መግለጽ አለባቸው።");
    }

    const administrativeUnitId = user.administrative_unit_id;

    // Single optimized query for all duplicate checks
    const whereConditions = [
      { phone_number: data.phone_number },
      { national_id: data.national_id }
    ];
    
    if (data.email) {
      whereConditions.push({ email: data.email });
    }

    const existingUser = await User.findOne({
      where: {
        [Op.or]: whereConditions,
        deletedAt: { [Op.eq]: null }
      },
      attributes: ['email', 'phone_number', 'national_id'],
      logging: false, // Disable query logging for performance
      benchmark: false
    });

    if (existingUser) {
      if (existingUser.phone_number === data.phone_number) {
        throw new Error("ይህ ስልክ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
      if (existingUser.national_id === data.national_id) {
        throw new Error("ይህ ብሔራዊ መታወቂያ ቁጥር ቀደም ሲል ተመዝግቧል።");
      }
      if (existingUser.email === data.email) {
        throw new Error("ይህ ኢሜይል ቀደም ሲል ተመዝግቧል።");
      }
    }

    // Optimized password hashing with cost adjustment
    const rawPassword = data.password || "12345678";
    const hashedPassword = await bcrypt.hash(rawPassword, 12); // Higher security for production

    // Prepare data with only necessary fields
    const officialData = {
      first_name: data.first_name,
      last_name: data.last_name,
      middle_name: data.middle_name || null,
      email: data.email || null,
      phone_number: data.phone_number,
      password: hashedPassword,
      role_id: data.role_id,
      administrative_unit_id: administrativeUnitId,
      oversight_office_id: data.oversight_office_id || null,
      national_id: data.national_id,
      address: data.address || null,
      gender: data.gender,
      profile_picture: data.profile_picture || null,
      relationship_type: null,
      marital_status: data.marital_status || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_by: user.id,
    };

    // Create user with performance optimizations
    const official = await User.create(officialData, {
      logging: false,
      benchmark: false,
      returning: true // Ensure we get the created record
    });

    return official;

  } catch (error) {
    // More specific error handling for large datasets
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new Error("የተደጋገመ መረጃ አልተገናኘም።");
    }
    if (error.name === 'SequelizeDatabaseError') {
      throw new Error("የውሂብ ጎታ ስህተት። እባክዎ እንደገና ይሞክሩ።");
    }
    
    throw new Error(`ባለሥልጣን መፍጠር ስህተት: ${error.message}`);
  }
};

const login = async ({ email, password }, options = {}) => {
  try {
    // Input validation
    if (!email) throw new Error("ኢሜል ያስፈልጋል");
    if (!password) throw new Error("የይለፍ ቃል ያስፈልጋል");

    // Find user without transaction (read operation doesn't need transaction)
    const user = await User.findOne({
      where: { 
        email, 
        deletedAt: null, 
        is_active: true 
      },
      include: [{ 
        model: Role, 
        as: "role", 
        attributes: ["id", "name"] 
      }],
      attributes: [
        'id', 'first_name', 'last_name', 'administrative_unit_id',
        'oversight_office_id', 'phone_number', 'middle_name', 'email', 
        'national_id', 'password', 'otp', 'otpExpiry', 'isFirstLogin',
        'profile_picture', 'last_login'
      ],
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error("የተሳሳተ የይለፍ ቃል");

    // Handle first-time login
    if (user.isFirstLogin) {
      await sendOTP(user.email); // Remove transaction from OTP send
      return { 
        success: true, 
        message: "OTP ወደ ኢሜልዎ ተልኳል። እባክዎ ያረጋግጡ።",
        requiresOTPVerification: true 
      };
    }

    // Update last login without transaction (single update operation)
    await user.update({ last_login: new Date() });

    // Generate token
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
        oversight_office_id: user.oversight_office_id,
        profile_picture: user.profile_picture,
      },
      message: "በተሳካ ሁኔታ ገብተዋል"
    };
  } catch (error) {
    throw error;
  }
};

const sendOTP = async (email) => {
  try {
    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    
    // Check if existing OTP is still valid
    const now = new Date();
    if (user.otpExpiry && user.otpExpiry > now) {
      const remainingSeconds = Math.ceil((user.otpExpiry - now) / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const seconds = remainingSeconds % 60;
      throw new Error(
        `እባክዎ ያለፈውን OTP ይጠቀሙ ወይም ከ${remainingMinutes} ደቂቃና ${seconds} ሰከንድ በኋላ እንደገና ይሞክሩ`
      );
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`Generated OTP for ${email}: ${otp}`);
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);
    
    // Update user with new OTP (no transaction needed for single update)
    await user.update({ otp, otpExpiry });

    // Send OTP email using reusable transporter
    await emailTransporter.sendMail({
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

    return { success: true, message: "OTP በትክክል ተልኳል" };
  } catch (error) {
    throw error;
  }
};

const resendOTP = async (email) => {
  try {
    if (!email) throw new Error("ኢሜል ያስፈልጋል");

    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      attributes: ['id', 'email', 'isFirstLogin', 'otp', 'otpExpiry']
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    
    // Check if existing OTP is still valid
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

    // Use the optimized sendOTP function
    await sendOTP(email);
    
    return { 
      success: true, 
      message: "አዲስ OTP ወደ ኢሜልዎ ተልኳል። እባክዎ ያረጋግጡ።",
      requiresOTPVerification: true 
    };
  } catch (error) {
    throw error;
  }
};
const verifyOTP = async ({ email, otp }) => {
  try {
    const user = await User.findOne({
      where: { email, deletedAt: null, is_active: true },
      include: [{ model: Role, as: "role" }],
    });

    if (!user) throw new Error("ተጠቃሚ አልተገኘም");
    if (!user.otp) throw new Error("OTP አልተጠየቀም");
    if (user.otpExpiry < new Date()) throw new Error("OTP ጊዜው አልፎታል");
    if (user.otp !== otp) throw new Error("የተሳሳተ OTP");

    // Update user (no transaction needed for single atomic operation)
    await user.update({
      isFirstLogin: false,
      last_login: new Date(),
      otp: null,
      otpExpiry: null
    });

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
    throw error;
  }
};

const logoutService = async (userId, options = {}) => {
  const { transaction } = options;
  try {
    

    return { message: "በተሳካ ሁኔታ ወጣል።" };
  } catch (error) {
    throw new Error(`መውጫ ስህተት: ${error.message}`);
  }
};

const forgotPasswordService = async (email) => {
  if (!email) throw new Error("Email is required.");

  const user = await User.findOne({
    where: {
      email: email,
      deletedAt: null,
    },
  });
  if (!user) throw new Error("User not found.");

  
  const resetToken = jwt.sign(
    {
      userId: user.id, 
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000;
  await user.save();

  
  await sendPasswordResetEmail(user.email, user.name, resetToken);

  return { success: true, message: "የሪሴት ሊንክ ወደ ኢሜልዎ ተልኳል" };
};

const resetPasswordService = async (token, newPassword) => {
  let transaction;
  
  try {
    transaction = await sequelize.transaction();
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId) {
      throw new Error("Invalid token: missing user ID");
    }

    // Find user with valid token
    const user = await User.findOne({
      where: {
        id: decoded.userId, 
        resetPasswordToken: token,
        resetPasswordExpires: { [Op.gt]: Date.now() },
      },
      transaction: transaction,
    });

    if (!user) throw new Error("Invalid or expired token");

    // Hash the new password before saving
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user with hashed password
    await user.update({
      password: hashedPassword, 
      resetPasswordToken: null,
      resetPasswordExpires: null,
    }, { transaction: transaction });

    await transaction.commit();
    
    return { success: true, message: "Password reset successful" };
  } catch (error) {
    if (transaction) await transaction.rollback();
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
    
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
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
  registerOfficialByManagerService,
  login,
  verifyOTP,
  sendOTP,
  resendOTP,
  logoutService,
  forgotPasswordService,
};
