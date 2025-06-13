const userService = require('../services/userService');

exports.createUser = async (req, res) => {
    try {
        const user = await userService.createUserService(req.body);
        res.status(201).json({ message: 'User created successfully.', user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsersService();
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getUserById = async (req, res) => {
    try {
        const user = await userService.getUserByIdService(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const user = await userService.updateUserService(req.params.id, req.body);
        res.status(200).json({ message: 'User updated successfully.', user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        await userService.deleteUserService(req.params.id);
        res.status(200).json({ message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
