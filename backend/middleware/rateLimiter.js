const rateLimit = new Map();

const rateLimiter = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
    const userId = req.userId || req.ip;
    const now = Date.now();
    
    if (!rateLimit.has(userId)) {
      rateLimit.set(userId, []);
    }
    
    const userRequests = rateLimit.get(userId);
    
    // Remove old requests outside the window
    while (userRequests.length && userRequests[0] < now - windowMs) {
      userRequests.shift();
    }
    
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
      });
    }
    
    userRequests.push(now);
    next();
  };
};

module.exports = rateLimiter;