import express from 'express'
import Rating from '../models/Rating.js'
import Hospital from '../models/Hospital.js'
import { protect } from '../middleware/authMiddleware.js'

const router = express.Router()

// POST /api/ratings/:hospitalId
// logged in user submits a star rating
router.post('/:hospitalId', protect, async (req, res) => {
  try {
    const { stars } = req.body
    const { hospitalId } = req.params

    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({ message: 'Stars must be between 1 and 5' })
    }

    // check hospital exists and is approved
    const hospital = await Hospital.findOne({
      _id: hospitalId,
      status: 'approved',
    })

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    // check if user already rated this hospital
    // the compound unique index in Rating.js also enforces this at DB level
    // but we check here too for a cleaner error message
    const existing = await Rating.findOne({
      user: req.user._id,
      hospital: hospitalId,
    })

    if (existing) {
      return res
        .status(400)
        .json({ message: 'You have already rated this hospital' })
    }

    // create the rating
    await Rating.create({
      user: req.user._id,
      hospital: hospitalId,
      stars,
    })

    // recalculate avgRating and ratingCount on the hospital document
    // so we don't have to compute it live every time detail page loads
    const allRatings = await Rating.find({ hospital: hospitalId })
    const total = allRatings.reduce((sum, r) => sum + r.stars, 0)

    hospital.ratingCount = allRatings.length
    hospital.avgRating = parseFloat((total / allRatings.length).toFixed(1))
    await hospital.save()

    return res.status(201).json({
      message: 'Rating submitted',
      avgRating: hospital.avgRating,
      ratingCount: hospital.ratingCount,
    })
  } catch (err) {
    // handle duplicate key error from the compound index
    if (err.code === 11000) {
      return res
        .status(400)
        .json({ message: 'You have already rated this hospital' })
    }
    console.error(err)
    return res.status(500).json({ message: 'Server error submitting rating' })
  }
})

// GET /api/ratings/:hospitalId/mine
// check if the logged in user has already rated this hospital
// React uses this to show the star widget as filled or empty on page load
router.get('/:hospitalId/mine', protect, async (req, res) => {
  try {
    const rating = await Rating.findOne({
      user: req.user._id,
      hospital: req.params.hospitalId,
    })

    return res.status(200).json({
      hasRated: !!rating,
      stars: rating ? rating.stars : null,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error fetching rating' })
  }
})

export default router
