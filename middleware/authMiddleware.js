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

      // verify token and decode the payload
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // attach the user to the request object (minus the password)
      req.user = await User.findById(decoded.id).select('-password')

      next()
    } catch (err) {
      return res
        .status(401)
        .json({ message: 'Token invalid or expired, please login again' })
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
