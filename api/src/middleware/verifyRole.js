// RBAC middleware for role checking
function isHod(req, res, next) {
  if (req.user && req.user.role === 'hod') {
    return next();
  }
  return res.status(403).json({ message: 'Requires HOD role' });
}

function isAhodOrHod(req, res, next) {
  if (req.user && (req.user.role === 'ahod' || req.user.role === 'hod')) {
    return next();
  }
  return res.status(403).json({ message: 'Requires AHOD or HOD role' });
}

function hasRole(roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ message: 'Not authorized' });
  };
}

module.exports = { isHod, isAhodOrHod, hasRole };