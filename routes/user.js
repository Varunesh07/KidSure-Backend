import express from 'express'
import User from '../models/User.js'
import Hospital from '../models/Hospital.js'
import { protect } from '../middleware/authMiddleware.js'

const router = express.Router()

// GET /api/user/saved
// returns the full hospital documents the user has saved
router.get('/saved', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedHospitals',
      match: { status: 'approved' }, // only return approved ones
    })

    return res.status(200).json(user.savedHospitals)
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ message: 'Server error fetching saved hospitals' })
  }
})

// POST /api/user/saved/:hospitalId
// toggle save — if already saved unsave it, if not saved save it
router.post('/saved/:hospitalId', protect, async (req, res) => {
  try {
    const { hospitalId } = req.params

    const hospital = await Hospital.findOne({
      _id: hospitalId,
      status: 'approved',
    })

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    const user = await User.findById(req.user._id)
    const alreadySaved = user.savedHospitals.includes(hospitalId)

    if (alreadySaved) {
      // unsave — remove from array
      user.savedHospitals = user.savedHospitals.filter(
        (id) => id.toString() !== hospitalId,
      )
    } else {
      // save — add to array
      user.savedHospitals.push(hospitalId)
    }

    await user.save()

    return res.status(200).json({
      saved: !alreadySaved,
      savedHospitals: user.savedHospitals,
    })
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ message: 'Server error toggling saved hospital' })
  }
})

export default router
