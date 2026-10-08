import express from 'express'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import User from '../models/User.js'
import { protect } from '../middleware/authMiddleware.js'
import {
  generateTokens,
  generateAccessToken,
  getRefreshTokenCookieOptions,
  hashToken,
} from '../utils/tokens.js'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const router = express.Router()

// Helper to save a new refresh token hash to user record (and prune expired ones)
const attachRefreshTokenToUser = async (user, tokenData) => {
  // Prune any expired tokens
  user.refreshTokens = (user.refreshTokens || []).filter(
    (rt) => rt.expiresAt && rt.expiresAt > new Date()
  )

  user.refreshTokens.push({
    tokenHash: tokenData.tokenHash,
    familyId: tokenData.familyId,
    createdAt: new Date(),
    expiresAt: tokenData.expiresAt,
  })

  await user.save()
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
    // superadmin can never be created via the API — set manually in Atlas
    const allowedRoles = ['user', 'hospital_admin']
    const assignedRole = allowedRoles.includes(role) ? role : 'user'

    const user = await User.create({
      name,
      email,
      password, // pre('save') hook in User.js hashes this automatically
      phone: phone || '',
      role: assignedRole,
    })

    // Generate token pair (short-lived access + long-lived refresh)
    const tokens = generateTokens(user)
    await attachRefreshTokenToUser(user, tokens)

    // Set HttpOnly refresh cookie
    res.cookie(
      'refreshToken',
      tokens.refreshToken,
      getRefreshTokenCookieOptions()
    )

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessToken: tokens.accessToken,
      token: tokens.accessToken, // backward compatibility
    })
  } catch (err) {
    console.error('Registration error:', err)
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

    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' })
    }

    // Generate token pair
    const tokens = generateTokens(user)
    await attachRefreshTokenToUser(user, tokens)

    // Set HttpOnly refresh cookie
    res.cookie(
      'refreshToken',
      tokens.refreshToken,
      getRefreshTokenCookieOptions()
    )

    const freshUser = await User.findById(user._id).select('-password')

    return res.status(200).json({
      _id: freshUser._id,
      name: freshUser.name,
      email: freshUser.email,
      role: freshUser.role,
      managedHospital: freshUser.managedHospital,
      savedHospitals: freshUser.savedHospitals || [],
      accessToken: tokens.accessToken,
      token: tokens.accessToken, // backward compatibility
    })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ message: 'Server error during login' })
  }
})

// POST /api/auth/refresh
// Receives HttpOnly cookie, verifies JWT signature, validates tokenHash in DB,
// prunes old token and rotates to issue a new access token and a new refresh token.
router.post('/refresh', async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken

    if (!incomingRefreshToken) {
      return res.status(401).json({ message: 'Refresh token cookie missing' })
    }

    let decoded
    try {
      decoded = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
      )
    } catch (jwtErr) {
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions())
      return res.status(401).json({ message: 'Invalid or expired refresh token' })
    }

    const user = await User.findById(decoded.id)
    if (!user) {
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions())
      return res.status(401).json({ message: 'User not found' })
    }

    const incomingHash = hashToken(incomingRefreshToken)
    const tokenIndex = (user.refreshTokens || []).findIndex(
      (rt) => rt.tokenHash === incomingHash
    )

    // Token Reuse Detection:
    // The JWT is cryptographically valid for this user, but its hash was already removed from the DB!
    // This happens if a revoked or already rotated token is presented again.
    if (tokenIndex === -1) {
      console.warn(
        `[SECURITY WARNING] Refresh token reuse detected for user ${user._id}. Invalidating family.`
      )
      if (decoded.familyId) {
        user.refreshTokens = user.refreshTokens.filter(
          (rt) => rt.familyId !== decoded.familyId
        )
      } else {
        user.refreshTokens = []
      }
      await user.save()
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions())
      return res.status(401).json({
        message: 'Refresh token reuse detected. Please log in again.',
      })
    }

    // Check expiration against stored database record
    const storedToken = user.refreshTokens[tokenIndex]
    if (storedToken.expiresAt && storedToken.expiresAt < new Date()) {
      user.refreshTokens.splice(tokenIndex, 1)
      await user.save()
      res.clearCookie('refreshToken', getRefreshTokenCookieOptions())
      return res.status(401).json({ message: 'Refresh token has expired' })
    }

    // ROTATION: Invalidate the old refresh token
    user.refreshTokens.splice(tokenIndex, 1)

    // Generate new token pair preserving the token family
    const newTokens = generateTokens(user, decoded.familyId)

    // Prune any expired entries and store new hash
    user.refreshTokens = user.refreshTokens.filter(
      (rt) => rt.expiresAt && rt.expiresAt > new Date()
    )
    user.refreshTokens.push({
      tokenHash: newTokens.tokenHash,
      familyId: newTokens.familyId,
      createdAt: new Date(),
      expiresAt: newTokens.expiresAt,
    })
    await user.save()

    // Send new HttpOnly refresh cookie
    res.cookie(
      'refreshToken',
      newTokens.refreshToken,
      getRefreshTokenCookieOptions()
    )

    return res.status(200).json({
      accessToken: newTokens.accessToken,
      token: newTokens.accessToken, // backward compatibility
    })
  } catch (err) {
    console.error('Refresh token error:', err)
    return res.status(500).json({ message: 'Server error processing token refresh' })
  }
})

// POST /api/auth/logout
// Revokes the refresh token from the database and clears the HttpOnly cookie.
router.post('/logout', async (req, res) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken

    if (incomingRefreshToken) {
      try {
        const incomingHash = hashToken(incomingRefreshToken)
        await User.updateOne(
          { 'refreshTokens.tokenHash': incomingHash },
          { $pull: { refreshTokens: { tokenHash: incomingHash } } }
        )
      } catch (err) {
        console.error('Error during logout token revocation:', err)
      }
    }

    res.clearCookie('refreshToken', getRefreshTokenCookieOptions())
    return res.status(200).json({ message: 'Logged out successfully' })
  } catch (err) {
    console.error('Logout error:', err)
    return res.status(500).json({ message: 'Server error during logout' })
  }
})

// GET /api/auth/me
// Returns the logged-in user profile
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
      accessToken: generateAccessToken(freshUser),
      token: generateAccessToken(freshUser),
    })
  } catch (err) {
    console.error('Auth/me error:', err)
    return res.status(500).json({ message: 'Server error fetching user profile' })
  }
})

// POST /api/auth/google
router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body

    if (!access_token) {
      return res.status(400).json({ message: 'Google access token is required' })
    }

    // Fetch the user's profile from Google using the access token
    const googleRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    )

    if (!googleRes.ok) {
      return res
        .status(401)
        .json({ message: 'Invalid Google token. Please try again.' })
    }

    const { email, name } = await googleRes.json()

    // Check if a user with this Google email already exists
    let user = await User.findOne({ email })

    if (!user) {
      user = await User.create({
        name,
        email,
        password: `google_oauth_${Date.now()}`,
        role: 'user',
        phone: '',
      })
    }

    // Generate token pair
    const tokens = generateTokens(user)
    await attachRefreshTokenToUser(user, tokens)

    // Set HttpOnly refresh cookie
    res.cookie(
      'refreshToken',
      tokens.refreshToken,
      getRefreshTokenCookieOptions()
    )

    const freshUser = await User.findById(user._id).select('-password')
    return res.status(200).json({
      _id: freshUser._id,
      name: freshUser.name,
      email: freshUser.email,
      role: freshUser.role,
      managedHospital: freshUser.managedHospital,
      savedHospitals: freshUser.savedHospitals || [],
      accessToken: tokens.accessToken,
      token: tokens.accessToken, // backward compatibility
    })
  } catch (err) {
    console.error('Google Auth Error:', err)
    return res
      .status(401)
      .json({ message: 'Google sign-in failed. Please try again.' })
  }
})

export default router
