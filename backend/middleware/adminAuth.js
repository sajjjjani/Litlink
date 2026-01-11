const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to require admin authentication
const requireAdmin = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }
        
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        // Find user
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Check if user is admin
        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }
        
        // Attach user to request
        req.user = user;
        req.token = token;
        next();
        
    } catch (error) {
        console.error('Admin auth error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// Middleware to check specific permissions
const requirePermission = (permission) => {
    return (req, res, next) => {
        try {
            // Check if user has admin permissions array
            if (!req.user.adminPermissions || !Array.isArray(req.user.adminPermissions)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. No permissions configured.'
                });
            }
            
            // Check if user has the required permission
            if (!req.user.adminPermissions.includes(permission)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission: ${permission}`
                });
            }
            
            next();
            
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error'
            });
        }
    };
};

module.exports = {
    requireAdmin,
    requirePermission
};