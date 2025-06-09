const { createUserService } = require('../services/userService');

exports.createUser = async (req, res)=>{
 try {
    const userData = req.body;
    const user = await createUserService(userData);
     res.status(201).json({
        status:"success",
        data: user
    })
 } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
    
 };


