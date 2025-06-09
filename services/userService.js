const { User } = require("../models");

exports.createUserService = async (data)=>{
 try {
    const { name, email, password, role_id, administrative_unit_id } = data;
    if (!name || !email || !password || !role_id || !administrative_unit_id) {
      throw new Error('All fields are required');
    }
    if (!User) {
      throw new Error('User model is not defined');
    }
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new Error('User with this email already exists');
    }
    const user = await User.create({
      name,
      email,
      password_hash: password, 
      role_id,
      administrative_unit_id,
    });
    return user;
 } catch (error) {
    throw new Error(`Failed to create user: ${error.message}`);
    
 }
};