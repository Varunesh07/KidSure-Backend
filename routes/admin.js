import express from 'express'
import Hospital from '../models/Hospital.js'
import User from '../models/User.js'
import { protect, superAdminOnly } from '../middleware/authMiddleware.js'

const router = express.Router()

// GET /api/admin/pending
// returns all hospitals waiting for approval
router.get('/pending', protect, superAdminOnly, async (req, res) => {
  try {
    const hospitals = await Hospital.find({ status: 'pending' })
      .populate('submittedBy', 'name email phone')
      .sort({ createdAt: 1 }) // oldest first so nothing gets buried

    return res.status(200).json({
      count: hospitals.length,
      hospitals,
    })
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ message: 'Server error fetching pending hospitals' })
  }
})

// GET /api/admin/all
// returns all hospitals regardless of status — for admin dashboard overview
router.get('/all', protect, superAdminOnly, async (req, res) => {
  try {
    const hospitals = await Hospital.find()
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 })

    return res.status(200).json({
      count: hospitals.length,
      hospitals,
    })
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ message: 'Server error fetching all hospitals' })
  }
})

// PUT /api/admin/approve/:id
// superadmin approves a pending hospital
router.put('/approve/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id)

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    if (hospital.status === 'approved') {
      return res.status(400).json({ message: 'Hospital is already approved' })
    }

    hospital.status = 'approved'
    hospital.approvedAt = new Date()
    hospital.rejectionReason = '' // clear any previous rejection reason
    await hospital.save()

    return res.status(200).json({
      message: 'Hospital approved successfully',
      hospital,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error approving hospital' })
  }
})

// PUT /api/admin/reject/:id
// superadmin rejects a pending hospital with a reason
router.put('/reject/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const { reason } = req.body

    if (!reason || reason.trim() === '') {
      return res.status(400).json({ message: 'Rejection reason is required' })
    }

    const hospital = await Hospital.findById(req.params.id)

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    if (hospital.status === 'rejected') {
      return res.status(400).json({ message: 'Hospital is already rejected' })
    }

    hospital.status = 'rejected'
    hospital.rejectionReason = reason.trim()
    hospital.approvedAt = null
    await hospital.save()

    return res.status(200).json({
      message: 'Hospital rejected',
      hospital,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error rejecting hospital' })
  }
})

// DELETE /api/admin/delete/:id
// superadmin permanently deletes a hospital
router.delete('/delete/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id)

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    // unlink from the hospital_admin's profile
    await User.findByIdAndUpdate(hospital.submittedBy, {
      managedHospital: null,
    })

    await hospital.deleteOne()

    return res.status(200).json({ message: 'Hospital deleted successfully' })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error deleting hospital' })
  }
})

// GET /api/admin/users
// superadmin views all users — useful for promoting to hospital_admin
router.get('/users', protect, superAdminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 })

    return res.status(200).json({
      count: users.length,
      users,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error fetching users' })
  }
})

// PUT /api/admin/users/:id/promote
// superadmin promotes a regular user to hospital_admin
router.put('/users/:id/promote', protect, superAdminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password')

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    if (user.role === 'superadmin') {
      return res.status(400).json({ message: 'Cannot change superadmin role' })
    }

    if (user.role === 'hospital_admin') {
      return res
        .status(400)
        .json({ message: 'User is already a hospital admin' })
    }

    user.role = 'hospital_admin'
    await user.save()

    return res.status(200).json({
      message: 'User promoted to hospital admin',
      user,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error promoting user' })
  }
})

export default router
