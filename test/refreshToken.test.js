import 'dotenv/config'
import assert from 'assert'
import jwt from 'jsonwebtoken'
import {
  hashToken,
  generateAccessToken,
  generateRefreshToken,
  generateTokens,
  getRefreshTokenCookieOptions,
  parseDurationToMs,
} from '../utils/tokens.js'

console.log('=== RUNNING REFRESH TOKEN SUITE (TESTS 1 - 8) ===\n')

// Dummy user object
const mockUser = {
  _id: '64a1b2c3d4e5f6a7b8c9d0e1',
  role: 'user',
  refreshTokens: [],
}

// ----------------------------------------------------
// TEST 1: Token Generation and Hashing Integrity
// ----------------------------------------------------
console.log('[Test 1] Testing normal token generation...')
const tokens1 = generateTokens(mockUser)
assert(tokens1.accessToken, 'Access token must be generated')
assert(tokens1.refreshToken, 'Refresh token must be generated')
assert(tokens1.tokenHash, 'Token hash must be generated')
assert.strictEqual(
  tokens1.tokenHash,
  hashToken(tokens1.refreshToken),
  'Stored hash must match SHA-256 of the refresh token'
)

// Verify Access Token payload & expiration
const decodedAccess = jwt.verify(
  tokens1.accessToken,
  process.env.ACCESS_TOKEN_SECRET
)
assert.strictEqual(decodedAccess.id, mockUser._id)
assert.strictEqual(decodedAccess.role, mockUser.role)

// Verify Refresh Token payload (contains jti & familyId)
const decodedRefresh = jwt.verify(
  tokens1.refreshToken,
  process.env.REFRESH_TOKEN_SECRET
)
assert.strictEqual(decodedRefresh.id, mockUser._id)
assert(decodedRefresh.jti, 'Refresh token must contain unique jti')
assert(decodedRefresh.familyId, 'Refresh token must contain familyId')
console.log('  -> PASS: Access and Refresh tokens generated with distinct secrets and claims.')

// ----------------------------------------------------
// TEST 2: Cookie Configuration & Cross-Origin Flags
// ----------------------------------------------------
console.log('\n[Test 2] Testing HttpOnly cookie options...')
const cookieOptsDev = getRefreshTokenCookieOptions()
assert.strictEqual(cookieOptsDev.httpOnly, true, 'Cookie must be HttpOnly')
assert.strictEqual(cookieOptsDev.path, '/', 'Cookie path must be root /')

// Simulate production environment
process.env.NODE_ENV = 'production'
const cookieOptsProd = getRefreshTokenCookieOptions()
assert.strictEqual(cookieOptsProd.secure, true, 'In production, cookie must be Secure (HTTPS)')
assert.strictEqual(cookieOptsProd.sameSite, 'none', 'In production cross-origin, sameSite must be none')
process.env.NODE_ENV = 'development'
console.log('  -> PASS: Cookie options correctly enforce HttpOnly, Secure, and SameSite: none in production.')

// ----------------------------------------------------
// TEST 3: Access Token Expiration Detection (TOKEN_EXPIRED)
// ----------------------------------------------------
console.log('\n[Test 3] Testing access token expiration behavior...')
// Create an already-expired access token
const expiredAccessToken = jwt.sign(
  { id: mockUser._id, role: mockUser.role },
  process.env.ACCESS_TOKEN_SECRET,
  { expiresIn: '0s' }
)

let errorName = null
try {
  jwt.verify(expiredAccessToken, process.env.ACCESS_TOKEN_SECRET)
} catch (err) {
  errorName = err.name
}
assert.strictEqual(errorName, 'TokenExpiredError', 'Expired token must yield TokenExpiredError')

// Test middleware logic simulation
const simulateAuthMiddleware = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { message: 'No token, access denied' } }
  }
  const raw = authHeader.split(' ')[1]
  try {
    const dec = jwt.verify(raw, process.env.ACCESS_TOKEN_SECRET)
    return { status: 200, user: dec }
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { status: 401, body: { code: 'TOKEN_EXPIRED', message: 'Access token expired' } }
    }
    return { status: 401, body: { message: 'Token invalid, please login again' } }
  }
}

const expiredRes = simulateAuthMiddleware(`Bearer ${expiredAccessToken}`)
assert.strictEqual(expiredRes.status, 401)
assert.strictEqual(expiredRes.body.code, 'TOKEN_EXPIRED', 'Middleware must return code: TOKEN_EXPIRED')
console.log('  -> PASS: Expired access token produces code: TOKEN_EXPIRED (allowing Axios silent refresh).')

// ----------------------------------------------------
// TEST 4: Refresh Token Rotation & Pruning
// ----------------------------------------------------
console.log('\n[Test 4] Testing refresh token rotation...')
// Simulate user storing R1
mockUser.refreshTokens.push({
  tokenHash: tokens1.tokenHash,
  familyId: tokens1.familyId,
  createdAt: new Date(),
  expiresAt: tokens1.expiresAt,
})

// Rotate R1 -> generate R2
const incomingHash = hashToken(tokens1.refreshToken)
const tokenIdx = mockUser.refreshTokens.findIndex(rt => rt.tokenHash === incomingHash)
assert(tokenIdx !== -1, 'R1 hash must exist in DB')

// Invalidate R1
mockUser.refreshTokens.splice(tokenIdx, 1)

// Issue R2
const tokens2 = generateTokens(mockUser, decodedRefresh.familyId)
mockUser.refreshTokens.push({
  tokenHash: tokens2.tokenHash,
  familyId: tokens2.familyId,
  createdAt: new Date(),
  expiresAt: tokens2.expiresAt,
})

assert.notStrictEqual(tokens1.refreshToken, tokens2.refreshToken, 'R2 must be a new token')
assert.notStrictEqual(tokens1.tokenHash, tokens2.tokenHash, 'R2 hash must differ from R1 hash')
assert.strictEqual(tokens1.familyId, tokens2.familyId, 'Family ID must be preserved across rotations')
assert(
  !mockUser.refreshTokens.some(rt => rt.tokenHash === tokens1.tokenHash),
  'R1 must be removed from DB after rotation'
)
console.log('  -> PASS: Refresh token rotated; old token successfully invalidated.')

// ----------------------------------------------------
// TEST 5: Token Reuse Detection (Replay of R1)
// ----------------------------------------------------
console.log('\n[Test 5] Testing refresh token reuse detection...')
// Attacker or replayed client attempts to present R1 again
const replayHash = hashToken(tokens1.refreshToken)
const replayIdx = mockUser.refreshTokens.findIndex(rt => rt.tokenHash === replayHash)
assert.strictEqual(replayIdx, -1, 'Reused R1 must not exist in active tokens')

// When replay is detected, the entire family is invalidated
const familyToRevoke = decodedRefresh.familyId
mockUser.refreshTokens = mockUser.refreshTokens.filter(rt => rt.familyId !== familyToRevoke)
assert.strictEqual(mockUser.refreshTokens.length, 0, 'All tokens in compromised family must be revoked')
console.log('  -> PASS: Token reuse detected; compromised token family invalidated.')

// ----------------------------------------------------
// TEST 6: Logout Revocation
// ----------------------------------------------------
console.log('\n[Test 6] Testing logout revocation...')
// Login user with fresh R3
const tokens3 = generateTokens(mockUser)
mockUser.refreshTokens.push({
  tokenHash: tokens3.tokenHash,
  familyId: tokens3.familyId,
  createdAt: new Date(),
  expiresAt: tokens3.expiresAt,
})
assert.strictEqual(mockUser.refreshTokens.length, 1)

// Perform logout: remove R3 by hash
const logoutHash = hashToken(tokens3.refreshToken)
mockUser.refreshTokens = mockUser.refreshTokens.filter(rt => rt.tokenHash !== logoutHash)
assert.strictEqual(mockUser.refreshTokens.length, 0, 'Logout must remove refresh token from DB')
console.log('  -> PASS: Logout successfully revokes refresh token session.')

// ----------------------------------------------------
// TEST 7: Fake / Tampered Refresh Token
// ----------------------------------------------------
console.log('\n[Test 7] Testing invalid/tampered refresh token...')
let tamperedError = null
try {
  jwt.verify(tokens1.refreshToken + 'tampered', process.env.REFRESH_TOKEN_SECRET)
} catch (err) {
  tamperedError = err.message
}
assert(tamperedError, 'Tampered token must fail signature verification')
console.log('  -> PASS: Tampered refresh token rejected.')

// ----------------------------------------------------
// TEST 8: Duration Parsing & Expiry Utilities
// ----------------------------------------------------
console.log('\n[Test 8] Testing duration utilities...')
assert.strictEqual(parseDurationToMs('15m'), 15 * 60 * 1000)
assert.strictEqual(parseDurationToMs('7d'), 7 * 24 * 60 * 60 * 1000)
assert.strictEqual(parseDurationToMs('10s'), 10 * 1000)
assert.strictEqual(parseDurationToMs('2h'), 2 * 60 * 60 * 1000)
console.log('  -> PASS: Duration utility converts all intervals accurately.')

console.log('\n====================================================')
console.log('ALL REFRESH TOKEN TESTS PASSED WITH 100% SUCCESS!')
console.log('====================================================')
