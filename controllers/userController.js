const {
  createLandOwner,
  getUserById,
  updateUser,
  deleteUser,
} = require("../services/userService");

const createLandOwnerController = async (req, res) => {
  try {
    const { body, user: authUser } = req;
    if (!authUser) {
      return res.status(401).json({ error: "የመዝጋቢ ማረጋገጫ ያስፈልጋል እባክዎ ሎጊን ያድርጉ።" });
    }
    const primaryOwnerData = {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email || null,
      phone_number: body.phone_number || null,
      password: body.password || null,
      role_id: body.role_id || null,
      administrative_unit_id: body.administrative_unit_id,
      oversight_office_id: body.oversight_office_id || null,
      national_id: body.national_id,
      address: body.address || null,
      gender: body.gender,
      marital_status: body.marital_status,
      is_active: body.is_active !== undefined ? body.is_active : true,
    };
    const coOwnersData = Array.isArray(body.co_owners) ? body.co_owners.map(co => ({
      first_name: co.first_name,
      middle_name: co.middle_name,
      last_name: co.last_name,
      email: co.email || null,
      gender:co.gender,
      address: co.address || null,
      phone_number: co.phone_number || null,
      national_id: co.national_id,
      relationship_type: co.relationship_type,
    })) : [];
    const owner = await createLandOwner(primaryOwnerData, coOwnersData, authUser.id);
    return res.status(201).json({
      message: "የመሬት ባለቤት እና ተጋሪዎች በተሳካ ሁኔታ ተመዝግበዋል።",
      data: owner,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};


const getUserByIdController = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await getUserById(id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ ሁኔታ ተገኝቷል።`,
      data: user,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const updateUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, user: authUser } = req;
    if (!authUser) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const data = {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      phone_number: body.phone_number,
      password: body.password,
      role_id: body.role_id,
      administrative_unit_id: body.administrative_unit_id,
      oversight_office_id: body.oversight_office_id,
      national_id: body.national_id,
      address: body.address,
      gender: body.gender,
      relationship_type: body.relationship_type,
      marital_status: body.marital_status,
      primary_owner_id: body.primary_owner_id,
      is_active: body.is_active,
    };
    const user = await updateUser(id, data, authUser.id);
    return res.status(200).json({
      message: `መለያ ቁጥር ${id} ያለው ተጠቃሚ በተሳካ �ሁኔታ ተቀይሯል።`,
      data: user,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const deleteUserController = async (req, res) => {
  try {
    const { id } = req.params;
    const { user: authUser } = req;
    if (!authUser) {
      return res.status(401).json({ error: "ተጠቃሚ ማረጋገጫ ያስፈልጋል።" });
    }
    const result = await deleteUser(id, authUser.id);
    return res.status(200).json({
      message: result.message,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createLandOwnerController,
  getUserByIdController,
  updateUserController,
  deleteUserController,
};
