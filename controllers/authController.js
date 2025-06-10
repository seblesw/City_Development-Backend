const { User } = require("../models");

exports.registerUser = async (req, res) => {
    try {
        const userData = req.body;
        const user = await createUserService(userData);
        
        res.status(201).json({
        status: "success",
        data: user,
        });
    } catch (error) {
        res.status(400).json({
        status: "error",
        message: error.message,
        });
    }
    }
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                status: "error",
                message: "Email and password are required",
            });
        }
        const user = await User.findOne({ where: { email } });
        if (!user || user.password_hash !== password) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password",
            });
        }
        res.status(200).json({
            status: "success",
            data: {
                id: user.id,
                name: user.name,
                email: user.email,
                role_id: user.role_id,
                administrative_unit_id: user.administrative_unit_id,
            },
        });
    } catch (error) {
        res.status(500).json({
            status: "error",
            message: error.message,
        });
    }
}
