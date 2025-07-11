const jwt = require('jsonwebtoken');
const { LandRecord, User } = require('../models');

module.exports = (io) => {
  const connectedUsers = new Map();

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error'));
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findByPk(decoded.id);
      
      if (!user) return next(new Error('User not found'));
      
      socket.user = {
        id: user.id,
        role: user.role,
        administrativeUnitId: user.administrative_unit_id
      };
      
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id} (User: ${socket.user?.id || 'unauthenticated'})`);

    // Handle authentication confirmation
    socket.on('authenticate', async () => {
      if (socket.user?.id) {
        socket.join([
          `user_${socket.user.id}`,
          `admin_unit_${socket.user.administrativeUnitId}`,
          `role_${socket.user.role}`
        ]);
        
        connectedUsers.set(socket.user.id, {
          socketId: socket.id,
          lastActive: new Date()
        });
        
        socket.emit('authentication_success', {
          timestamp: new Date(),
          userId: socket.user.id
        });
        
        console.log(`User ${socket.user.id} authenticated with roles ${socket.user.role}`);
      }
    });

    // Handle status update acknowledgments
    socket.on('status_update_ack', (data) => {
      console.log(`User ${socket.user.id} acknowledged update for record ${data.recordId}`);
      // Can implement read receipts here
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      if (socket.user?.id) {
        connectedUsers.delete(socket.user.id);
        console.log(`User ${socket.user.id} disconnected`);
      }
    });

    // Error handling
    socket.on('error', (err) => {
      console.error(`Socket error (${socket.id}):`, err);
    });
  });

  // Notification system
  io.notifyUser = async (userId, event, payload) => {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        console.error(`User ${userId} not found for notification`);
        return;
      }

      const socketData = connectedUsers.get(userId);
      if (socketData) {
        io.to(`user_${userId}`).emit(event, {
          ...payload,
          serverTime: new Date()
        });
        console.log(`Notification sent to user ${userId}`);
      } else {
        console.log(`User ${userId} is not currently connected`);
        // Optionally queue notifications for when user reconnects
      }
    } catch (error) {
      console.error(`Error sending notification to user ${userId}:`, error);
    }
  };

  // Broadcast to admin unit
  io.notifyAdminUnit = (adminUnitId, event, payload) => {
    io.to(`admin_unit_${adminUnitId}`).emit(event, payload);
  };

  // Broadcast to role
  io.notifyRole = (role, event, payload) => {
    io.to(`role_${role}`).emit(event, payload);
  };
};