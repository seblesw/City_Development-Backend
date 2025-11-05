const { sequelize } = require("../models");
const {
  registerOfficial,
  login,
  forgotPasswordService,
  changePasswordService,
  resetPasswordService,
  verifyOTP,
  resendOTP,
  registerOfficialByManagerService,
} = require("../services/authServices");
const fs= require("fs")





const registerOfficialController = async (req, res) => {
  try {
    const { body } = req;
       const creatorId = req.user.id;
    
    if (!creatorId) {
      return res.status(401).json({ 
        error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" 
      });
    }
    const profilePicture = req.file ? `uploads/pictures/${req.file.filename}` : null;
    const data = {
      first_name: body.first_name,
      last_name: body.last_name,
      middle_name: body.middle_name || null,
      email: body.email || null, 
      phone_number: body.phone_number,
      password: body.password || "12345678",
      role_id: body.role_id,
      administrative_unit_id: body.administrative_unit_id || null,
      oversight_office_id: body.oversight_office_id || null,
      national_id: body.national_id,
      address: body.address || null,
      gender: body.gender,
      profile_picture:profilePicture,
      relationship_type: null,
      marital_status: body.marital_status || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_by: creatorId,
    };
    // Call the service to register the official
    const official = await registerOfficial(data);

    return res.status(201).json({
      message: "ባለሥልጣን በተሳካ ሁኔታ ተመዝግቧል።",
      data: official,
    });
  } catch (error) {
     if (req.file) fs.unlinkSync(req.file.path);
    
    return res.status(400).json({ error: error.message });
  }
};
const registerOfficialByManagerController = async (req, res) => {
  let transaction;
  try {
    const { body } = req;
    const user = req.user; 
    const profilePicture = req.file ? `uploads/pictures/${req.file.filename}` : null;
        
    const data = {
      first_name: body.first_name,
      last_name: body.last_name,
      middle_name: body.middle_name || null,
      email: body.email || null, 
      phone_number: body.phone_number,
      password: body.password || "12345678",
      role_id: body.role_id,
      administrative_unit_id: user.administrative_unit_id, 
      national_id: body.national_id,
      address: body.address || null,
      gender: body.gender,
      profile_picture: profilePicture,
      relationship_type: null,
      marital_status: body.marital_status || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
    };

    // Start transaction
    transaction = await sequelize.transaction();
    
    const official = await registerOfficialByManagerService(data, user, { transaction });

    await transaction.commit();

    return res.status(201).json({
      message: "ባለሥልጣን በተሳካ ሁኔታ ተመዝግቧል።",
      data: official,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    if (req.file) fs.unlinkSync(req.file.path);
    
    return res.status(400).json({ error: error.message });
  }
};

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email) {
      return res.status(400).json({ error: "ኢሜይል መግለጽ አለበት።" });
    }
    if (!password) {
      return res.status(400).json({ error: "የይለፍ ቃል መግለጽ አለበት።" });
    }

    const result = await login({ email, password });

    // Handle OTP verification case
    if (result.requiresOTPVerification) {
      return res.status(200).json({
        message: result.message,
        requiresOTPVerification: true,
        data: { email } 
      });
    }

    // Successful login
    return res.status(200).json({
      message: result.message || "መግባት ተሳክቷል።",
      data: result
    });

  } catch (error) {
    console.error("Login error:", error);

    // Enhanced error mapping
    let errorMessage = error.message;
    let statusCode = 400;

    if (error.message.includes("ተጠቃሚ አልተገኘም") || error.message.includes("User not found")) {
      errorMessage = "ተጠቃሚ አልተገኙም";
      statusCode = 404;
    } else if (error.message.includes("የተሳሳተ የይለፍ ቃል") || error.message.includes("Invalid") || error.message.includes("Incorrect")) {
      errorMessage = "የኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።";
      statusCode = 401;
    } else if (error.message.includes("ማኔጅሩ አስተዳደራዊ ክፍል የለውም")) {
      errorMessage = error.message;
      statusCode = 403;
    } else if (error.message.includes("OTP") || error.message.includes("እባክዎ ያለፈውን OTP")) {
      statusCode = 429; // Too Many Requests for OTP errors
    }

    return res.status(statusCode).json({ 
      error: errorMessage 
    });
  }
};
const resendOTPController = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "ኢሜል ያስፈልጋል",
      });
    }

    const result = await resendOTP(email);

    return res.status(200).json(result);
  } catch (error) {
    // Enhanced error mapping like other controllers
    let statusCode = 400;
    
    if (error.message.includes("OTP") || error.message.includes("ያለፈው OTP")) {
      statusCode = 429; // Too Many Requests for OTP rate limiting
    }

    return res.status(statusCode).json({
      success: false,
      message: error.message || "የOTP እንደገና ላክ አልተሳካም", 
    });
  }
};

const verifyOtpController = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        error: "ኢሜይል እና OTP መግለጽ አለበት።" 
      });
    }

    const result = await verifyOTP({ email, otp });
    
    return res.status(200).json({
      message: "OTP በትክክል ተረጋግጧል።",
      data: result
    });
  } catch (error) {
    // Enhanced error mapping with proper status codes
    let errorMessage = error.message;
    let statusCode = 400;

    if (error.message.includes("Invalid") || error.message.includes("No OTP") || error.message.includes("የተሳሳተ OTP")) {
      errorMessage = "የተሳሳተ ወይም ያልተገኘ OTP";
      statusCode = 401;
    } else if (error.message.includes("expired") || error.message.includes("ጊዜው አልፎታል")) {
      errorMessage = "OTP ጊዜው አልፎታል፣ እባክዎ አዲስ OTP ይጠይቁ";
      statusCode = 410; // Gone - resource expired
    } else if (error.message.includes("ተጠቃሚ አልተገኘም")) {
      errorMessage = "ተጠቃሚ አልተገኙም";
      statusCode = 404;
    }

    return res.status(statusCode).json({ 
      error: errorMessage 
    });
  }
};

const logoutController = (req, res) => {
  try {
    
    
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "መውጫ ስህተት አለ።" });
      }
      return res.status(200).json({ message: "በተሳካ ሁኔታ ውጣል።" });
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const forgotPasswordController = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "ኢሜይል መግለጽ አለበት።" });
    }
    
    await forgotPasswordService(email);
    return res
      .status(200)
      .json({ message: "የይለፍ ቃል እንደገና ማስተካከያ እባኮትን ይመልከቱ።" });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const result = await resetPasswordService(token, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};
const changePasswordController = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id; 

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "የይለፍ ቃል መግለጽ አለበት።" });
    }

    
    const result = await changePasswordService(
      userId,
      oldPassword,
      newPassword
    );

    return res.status(200).json({
      message: result.message,
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  registerOfficialController,
  resetPassword,
  loginController,
  registerOfficialByManagerController,
  resendOTPController,
  logoutController,
  verifyOtpController,
  forgotPasswordController,
  changePasswordController,
};
