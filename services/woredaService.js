const { Op } = require("sequelize");
const { Woreda, Zone, AdministrativeUnit } = require("../models");

const createWoredaService = async (woredaData) => {
  const { name, zone_id } = woredaData;

  // Check for duplicate woreda name in the same zone
  const existingWoreda = await Woreda.findOne({
    where: { name, zone_id, deletedAt: null },
  });
  
  if (existingWoreda) {
    throw new Error("የወረዳ ስም በዚህ ዞን ውስጥ ተይዟል።");
  }

  // Validate zone exists
  const zone = await Zone.findByPk(zone_id);
  if (!zone) {
    throw new Error("ትክክለኛ ዞን ይምረጡ።");
  }

  // Generate unique identifier
  const generateUniqueId = () => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
    // Take last 6 digits of timestamp + 3 random digits
    return `${timestamp.slice(-6)}${random}`;
  };

  // Generate the code
  const uniqueId = generateUniqueId();
  const code = `${zone.code}-W-${uniqueId}`;

  // Create the woreda
  const woreda = await Woreda.create({
    name,
    zone_id,
    code,
  });

  // Return the created woreda with associations
  return await Woreda.findByPk(woreda.id, {
    include: [
      { model: Zone, as: "zone" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });
};

const getAllWoredasService = async () => {
  return Woreda.findAll({
    where: { deletedAt: null },
    include: [
      { model: Zone, as: "zone" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
    order: [["createdAt", "DESC"]],
  });
};

const getWoredaByIdService = async (id) => {
  const woreda = await Woreda.findByPk(id, {
    where: { deletedAt: null },
    include: [
      { model: Zone, as: "zone" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });

  if (!woreda) {
    throw new Error("ወረዳ አልተገኘም።");
  }

  return woreda;
};

const updateWoredaService = async (id, woredaData, updatedByUserId) => {
  const woreda = await Woreda.findByPk(id, { where: { deletedAt: null } });
  if (!woreda) {
    throw new Error("ወረዳ አልተገኘም።");
  }

  const { name, zone_id } = woredaData;

  if (name || zone_id) {
    const existingWoreda = await Woreda.findOne({
      where: {
        name,
        zone_id: zone_id || woreda.zone_id,
        id: { [Op.ne]: id },
        deletedAt: null,
      },
    });
    if (existingWoreda) {
      throw new Error("የወረዳ ስም በዚህ ዞን ውስጥ ተይዟል።");
    }
  }

  let code = woreda.code;
  if (zone_id && zone_id !== woreda.zone_id) {
    const zone = await Zone.findByPk(zone_id);
    if (!zone) {
      throw new Error("ትክክለኛ ዞን ይምረጡ።");
    }
    const count = await Woreda.count({ where: { zone_id } });
    code = `${zone.code}-W${count + 1}`;
  }

  await woreda.update({
    name,
    zone_id,
    code,
    updated_by: updatedByUserId || null,
  });

  return Woreda.findByPk(id, {
    include: [
      { model: Zone, as: "zone" },
      { model: AdministrativeUnit, as: "administrativeUnits" },
    ],
  });
};

const deleteWoredaService = async (id, deletedByUserId) => {
  const woreda = await Woreda.findByPk(id, { where: { deletedAt: null } });
  if (!woreda) {
    throw new Error("ወረዳ አልተገኘም።");
  }

  await woreda.destroy({force:true});
};

module.exports = {
  createWoredaService,
  getAllWoredasService,
  getWoredaByIdService,
  updateWoredaService,
  deleteWoredaService,
};