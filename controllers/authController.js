const {
  registerOfficial,
  login,
  forgotPasswordService,
  changePasswordService,
  resetPasswordService,
  sendOTP,
} = require("../services/authServices");

const registerOfficialController = async (req, res) => {
  try {
    const { body } = req;
    // const user = req.user;

    // if (!user) {
    //   return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    // }

    const data = {
      first_name: body.first_name,
      last_name: body.last_name,
      middle_name: body.middle_name || null,
      email: body.email || null, 
      phone_number: body.phone_number,
      password: body.password || "12345678",
      role_id: body.role_id,
      administrative_unit_id: body.administrative_unit_id,
      oversight_office_id: body.oversight_office_id || null,
      national_id: body.national_id,
      address: body.address || null,
      gender: body.gender,
      relationship_type: null,
      marital_status: body.marital_status || null,
      primary_owner_id: null,
      is_active: body.is_active !== undefined ? body.is_active : true,
    };

    const official = await registerOfficial(data);

    return res.status(201).json({
      message: "ባለሥልጣን በተሳካ ሁኔታ ተመዝግቧል።",
      data: official,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const loginController = async (req, res) => {
  try {
    const { phone_number, password, otp } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: "ስልክ ቁጥር መግለጽ አለበት።" });
    }


    // Proceed with login (OTP or password)
    const result = await login({ phone_number, password, otp });

    return res.status(200).json({
      message: "መግባት ተሳክቷል።", 
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ 
      error: error.message.includes("Invalid") 
        ? "የስልክ ቁጥር፣ OTP ወይም �ስተኝጋሌ ትክክል አይደለም።" // "Invalid credentials"
        : error.message 
    });
  }
};
const sendOTPController = async (req, res) => {
  try {
    const { phone_number } = req.body;
    console.log("[API] /send-otp request:", phone_number);

    if (!phone_number) {
      console.log("[Validation] Phone number missing");
      return res.status(400).json({ error: "ስልክ ቁጥር መግለጽ አለበት።" });
    }

    const result = await sendOTP(phone_number);
    console.log("[API] OTP sent successfully:", phone_number);
    return res.status(200).json({
      message: "OTP በተሳካ ሁኔታ ተልኳል።",
      data: result,
    });

  } catch (error) {
    console.error("[API] OTP send error:", error.message);
    return res.status(400).json({ 
      error: "የስልክ ቁጥር ልክ አይደለም።" 
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
  sendOTPController,
  logoutController,
  forgotPasswordController,
  changePasswordController,
};
