const { User } = require("../models");

exports.registerUserService = async (userData) => {
    try {
        const { name, email, password, role_id, administrative_unit_id } = userData;
        if (!name || !email || !password || !role_id || !administrative_unit_id) {
            throw new Error('All fields are required');
        }
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            throw new Error('User with this email already exists');
        }
        const user = await User.create({
            name,
            email,
            password_hash: password, // In a real application, hash the password
            role_id,
            administrative_unit_id,
        });
        return user;
    } catch (error) {
        throw new Error(`Failed to register user: ${error.message}`);
    }
}