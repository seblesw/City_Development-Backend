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
  let fileToDelete = null;
  
  try {
    const { body } = req;
    const creatorId = req.user.id;
    
    if (!creatorId) {
      return res.status(401).json({ 
        error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" 
      });
    }

    // Store the file path immediately for cleanup
    fileToDelete = req.file ? req.file.path : null;
    
    // Use the filename for the database, but keep the actual path for cleanup
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
      profile_picture: profilePicture,
      relationship_type: null,
      marital_status: body.marital_status || null,
      is_active: body.is_active !== undefined ? body.is_active : true,
      created_by: creatorId,
    };

    const official = await registerOfficial(data);

    return res.status(201).json({
      message: "ባለሥልጣን በተሳካ ሁኔታ ተመዝግቧል።",
      data: official,
    });
  } catch (error) {
    // Safe file deletion with proper error handling
    if (fileToDelete) {
      safeFileDelete(fileToDelete);
    }
    
    return res.status(400).json({ error: error.message });
  }
};

// Helper function for safe file deletion
const safeFileDelete = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('Successfully deleted file:', filePath);
    } else {
      console.log('File not found, skipping deletion:', filePath);
    }
  } catch (fileError) {
    console.error('Error deleting file:', fileError.message);
  }
};

const registerOfficialByManagerController = async (req, res) => {
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

    const official = await registerOfficialByManagerService(data, user);

    return res.status(201).json({
      message: "ባለሥልጣን በተሳካ ሁኔታ ተመዝግቧል።",
      data: official,
    });
  } catch (error) {
     if (req.file) fs.unlinkSync(req.file.path);
    
    return res.status(400).json({ error: error.message });
  }
};

const loginController = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: "ኢሜይል መግለጽ አለበት።" });
    }

    const result = await login({ email, password });

    return res.status(200).json({
      message: "መግባት ተሳክቷል።", 
      data: result,
    });
  } catch (error) {
    
    
    const errorMessage = error.message.includes("Invalid") || error.message.includes("Incorrect")
      ? "የኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።"
      : error.message.includes("User not found")
      ? "ተጠቃሚ አልተገኙም"
      : error.message;

    return res.status(400).json({ 
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
    
    return res.status(400).json({
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
    
    
    const errorMessage = error.message.includes("Invalid") || error.message.includes("No OTP")
      ? "የተሳሳተ ወይም ያልተገኘ OTP"
      : error.message.includes("expired")
      ? "OTP ጊዜው አልፎታል፣ እባክዎ አዲስ OTP ይጠይቁ"
      : error.message;

    return res.status(400).json({ 
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
