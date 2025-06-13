const {User} = require('../models');

exports.createUserService = async (userData) => {
    return await User.create(userData);
};

exports.getAllUsersService = async () => {
    return await User.findAll();
};

exports.getUserByIdService = async (id) => {
    return await User.findByPk(id);
};

exports.updateUserService = async (id, updateData) => {
    await User.update(updateData, { where: { id } });
    return await User.findByPk(id);
};

exports.deleteUserService = async (id) => {
    return await User.destroy({ where: { id } });
};
