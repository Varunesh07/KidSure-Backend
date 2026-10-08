import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const protect = async (req, res, next) => {
  let token

  // check if Authorization header exists and starts with Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // extract token from "Bearer <token>"
      token = req.headers.authorization.split(' ')[1]

      // verify access token using ACCESS_TOKEN_SECRET (falling back to JWT_SECRET if unset)
      const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET
      const decoded = jwt.verify(token, secret)

      // attach the user to the request object (minus the password)
      req.user = await User.findById(decoded.id).select('-password')
      if (!req.user) {
        return res.status(401).json({ message: 'User no longer exists' })
      }

      return next()
    } catch (err) {
      // Explicitly distinguish expired access token so frontend can trigger silent refresh
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          code: 'TOKEN_EXPIRED',
          message: 'Access token expired',
        })
      }
      return res
        .status(401)
        .json({ message: 'Token invalid, please login again' })
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'No token, access denied' })
  }
}

// only allows hospital_admin and superadmin through
const hospitalAdminOnly = (req, res, next) => {
  if (
    req.user &&
    (req.user.role === 'hospital_admin' || req.user.role === 'superadmin')
  ) {
    next()
  } else {
    return res
      .status(403)
      .json({ message: 'Access denied — hospital admins only' })
  }
}

// only allows superadmin through
const superAdminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next()
  } else {
    return res.status(403).json({ message: 'Access denied — superadmin only' })
  }
}

export { protect, hospitalAdminOnly, superAdminOnly }
