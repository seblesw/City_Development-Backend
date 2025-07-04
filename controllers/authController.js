const { registerOfficial, login } = require("../services/authServices");

const registerOfficialController = async (req, res) => {
  try {
    const { body } = req;
    const user = req.user; 

    if (!user) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }

    const data = {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      phone_number: body.phone_number || null,
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

    const official = await registerOfficial(data, user);

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
    const { email, phone_number, password } = req.body;
    if (!email && !phone_number) {
      return res.status(400).json({ error: "ኢሜይል ወይም ስልክ ቁጥር መግለጽ አለበት።" });
    }
    if (!password) {
      return res.status(400).json({ error: "የይለፍ ቃል መግለጽ አለበት።" });
    }
    const result = await login({ email, phone_number, password });
    return res.status(200).json({
      message: "መግባት ተሳክቷል።",
      data: result,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  registerOfficialController,
  loginController,
};