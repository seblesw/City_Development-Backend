const {
  registerOfficial,
  login,
  forgotPasswordService,
  changePasswordService,
  resetPasswordService,
  verifyOTP,
  resendOTP,
} = require("../services/authServices");
const fs= require("fs")
const registerOfficialController = async (req, res) => {
  try {
    const { body } = req;
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
    };



    

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
    console.error("Login error:", error);
    
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
    console.error("Error resending OTP:", error.message);
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
    console.error("OTP verification error:", error);
    
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
//logout controller
const logoutController = (req, res) => {
  try {
    // Assuming you have a logout service that handles the logout logic
    // For example, clearing the session or token
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
//forgot password controller
const forgotPasswordController = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "ኢሜይል መግለጽ አለበት።" });
    }
    // Assuming you have a service to handle password reset logic
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

    // Call the service to change the password
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
  resendOTPController,
  logoutController,
  verifyOtpController,
  forgotPasswordController,
  changePasswordController,
};
