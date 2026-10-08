import crypto from 'crypto'
import jwt from 'jsonwebtoken'

/**
 * Computes a SHA-256 hash of a string (e.g. refresh token).
 * We store this hash in MongoDB rather than raw plaintext tokens.
 */
export const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/**
 * Parses time strings like '15m', '7d', '10s' into milliseconds.
 */
export const parseDurationToMs = (durationStr = '7d') => {
  const match = durationStr.match(/^(\d+)([smhd])$/)
  if (!match) return 7 * 24 * 60 * 60 * 1000 // default 7 days
  const val = parseInt(match[1], 10)
  const unit = match[2]
  switch (unit) {
    case 's': return val * 1000
    case 'm': return val * 60 * 1000
    case 'h': return val * 60 * 60 * 1000
    case 'd': return val * 24 * 60 * 60 * 1000
    default: return 7 * 24 * 60 * 60 * 1000
  }
}

/**
 * Generates a short-lived Access Token (15 min default).
 */
export const generateAccessToken = (user) => {
  const secret = process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET
  const expiresIn = process.env.ACCESS_TOKEN_EXPIRY || '15m'

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    secret,
    { expiresIn }
  )
}

/**
 * Generates a long-lived Refresh Token (7 days default) with a unique jti and familyId.
 */
export const generateRefreshToken = (user, familyId = null) => {
  const secret = process.env.REFRESH_TOKEN_SECRET
  const expiresIn = process.env.REFRESH_TOKEN_EXPIRY || '7d'
  const jti = crypto.randomUUID()
  const currentFamilyId = familyId || crypto.randomUUID()

  const token = jwt.sign(
    {
      id: user._id,
      jti,
      familyId: currentFamilyId,
    },
    secret,
    { expiresIn }
  )

  const expiresAt = new Date(Date.now() + parseDurationToMs(expiresIn))

  return {
    token,
    jti,
    familyId: currentFamilyId,
    expiresAt,
  }
}

/**
 * Generates both Access and Refresh tokens for a user.
 */
export const generateTokens = (user, familyId = null) => {
  const accessToken = generateAccessToken(user)
  const refresh = generateRefreshToken(user, familyId)

  return {
    accessToken,
    refreshToken: refresh.token,
    tokenHash: hashToken(refresh.token),
    familyId: refresh.familyId,
    expiresAt: refresh.expiresAt,
  }
}

/**
 * Returns options for setting the HttpOnly Refresh Token cookie.
 * In production (Vercel frontend + Render backend cross-origin), sameSite: 'none' and secure: true are required.
 */
export const getRefreshTokenCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === 'production'
  const maxAge = parseDurationToMs(process.env.REFRESH_TOKEN_EXPIRY || '7d')

  return {
    httpOnly: true,
    secure: isProduction, // HTTPS required when sameSite is 'none' in production
    sameSite: isProduction ? 'none' : 'lax',
    maxAge,
    path: '/',
  }
}
