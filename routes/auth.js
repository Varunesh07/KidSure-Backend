import express from 'express'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { protect } from '../middleware/authMiddleware.js'

const router = express.Router()

// helper — generates a JWT token from a user id
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body

    // basic validation
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Name, email and password are required' })
    }

    // check if email already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res
        .status(400)
        .json({ message: 'An account with this email already exists' })
    }

    // only allow user or hospital_admin on register
    // superadmin can never be created via the API — you set it manually in Atlas
    const allowedRoles = ['user', 'hospital_admin']
    const assignedRole = allowedRoles.includes(role) ? role : 'user'

    const user = await User.create({
      name,
      email,
      password, // pre('save') hook in User.js hashes this automatically
      phone: phone || '',
      role: assignedRole,
    })

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error during registration' })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required' })
    }

    // find user by email
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // matchPassword is the custom method we defined in User.js
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    const freshUser = await User.findById(user._id).select('-password')

    return res.status(200).json({
      _id: freshUser._id,
      name: freshUser.name,
      email: freshUser.email,
      role: freshUser.role,
      managedHospital: freshUser.managedHospital,
      savedHospitals: freshUser.savedHospitals || [],
      token: generateToken(freshUser._id),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error during login' })
  }
})

// GET /api/auth/me
// returns the logged in user's profile — React uses this on app load
// to check if the stored token is still valid
router.get('/me', protect, async (req, res) => {
  try {
    const freshUser = await User.findById(req.user._id).select('-password')

    return res.status(200).json({
      _id: freshUser._id,
      name: freshUser.name,
      email: freshUser.email,
      role: freshUser.role,
      managedHospital: freshUser.managedHospital,
      savedHospitals: freshUser.savedHospitals || [],
      token: generateToken(freshUser._id),
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error' })
  }
})

export default router
