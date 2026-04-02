import express from 'express'
import Hospital from '../models/Hospital.js'
import {
  protect,
  hospitalAdminOnly,
  superAdminOnly,
} from '../middleware/authMiddleware.js'
import upload from '../middleware/upload.js'
import User from '../models/User.js'


const router = express.Router()

// GET /api/hospitals/nearby
// called on home page load — fetches hospitals near the user's location
router.get('/nearby', protect, async (req, res) => {
  try {
    const { lng, lat, radius = 5000 } = req.query
    // radius in metres — default 5km

    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat are required' })
    }

    const hospitals = await Hospital.find({
      status: 'approved',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: parseFloat(radius),
        },
      },
    }).limit(10)

    return res.status(200).json(hospitals)
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ message: 'Server error fetching nearby hospitals' })
  }
})

// GET /api/hospitals/search
// search page — filter by category and distance
router.get('/search', protect, async (req, res) => {
  try {
    const { lng, lat, radius = 5000, category } = req.query

    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat are required' })
    }

    // build the query object dynamically
    const query = {
      status: 'approved',
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: parseFloat(radius),
        },
      },
    }

    // only add category filter if one was passed
    if (category) {
      query.categories = { $in: [category] }
    }

    const hospitals = await Hospital.find(query).limit(20)

    return res.status(200).json(hospitals)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error searching hospitals' })
  }
})

// GET /api/hospitals/:id
// hospital detail page
router.get('/:id', protect, async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id).populate('submittedBy', 'name email')

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    // Only allow viewing unapproved hospitals if the user is the owner or a superadmin
    if (hospital.status !== 'approved') {
      const isOwner = hospital.submittedBy._id.toString() === req.user._id.toString();
      const isSuperAdmin = req.user.role === 'superadmin';
      
      if (!isOwner && !isSuperAdmin) {
        return res.status(404).json({ message: 'Hospital not found' });
      }
    }

    return res.status(200).json(hospital)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error fetching hospital' })
  }
})

// POST /api/hospitals/submit
// hospital_admin submits a new hospital listing
router.post('/submit', protect, hospitalAdminOnly, async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      coverImage,
      coordinates, // [lng, lat] from the map picker in the form
      categories,
      operatingHours,
      is24x7,
      isEmergency,
    } = req.body

    if (!name || !address || !phone || !coordinates) {
      return res
        .status(400)
        .json({ message: 'Name, address, phone and location are required' })
    }

    // check if this hospital_admin already submitted a hospital
    const existing = await Hospital.findOne({ submittedBy: req.user._id })
    console.log('user id:', req.user._id)
    console.log('existing hospital found:', existing)
    if (existing) {
      return res
        .status(400)
        .json({ message: 'You have already submitted a hospital listing' })
    }

    const hospital = await Hospital.create({
      name,
      address,
      phone,
      coverImage: coverImage || '',
      location: {
        type: 'Point',
        coordinates: coordinates, // [lng, lat]
      },
      categories: categories || [],
      operatingHours: operatingHours || [],
      is24x7: is24x7 || false,
      isEmergency: isEmergency || false,
      status: 'pending', // always starts as pending
      submittedBy: req.user._id,
    })

    // link hospital to the admin's profile
   await User.findByIdAndUpdate(req.user._id, {
     managedHospital: hospital._id,
   })

    return res.status(201).json({
      message: 'Hospital submitted successfully, awaiting approval',
      hospital,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error submitting hospital' })
  }
})

// PUT /api/hospitals/:id/edit
// hospital_admin edits their own listing
router.put('/:id/edit', protect, hospitalAdminOnly, async (req, res) => {
  try {
    const hospital = await Hospital.findById(req.params.id)

    if (!hospital) {
      return res.status(404).json({ message: 'Hospital not found' })
    }

    // make sure this admin owns this hospital
    if (hospital.submittedBy.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ message: 'You can only edit your own hospital listing' })
    }

    const {
      name,
      address,
      phone,
      coverImage,
      categories,
      operatingHours,
      is24x7,
      isEmergency,
    } = req.body

    // only update fields that were actually sent
    if (name) hospital.name = name
    if (address) hospital.address = address
    if (phone) hospital.phone = phone
    if (coverImage) hospital.coverImage = coverImage
    if (categories) hospital.categories = categories
    if (operatingHours) hospital.operatingHours = operatingHours
    if (is24x7 !== undefined) hospital.is24x7 = is24x7
    if (isEmergency !== undefined) hospital.isEmergency = isEmergency

    // editing puts it back to pending for re-approval
    hospital.status = 'pending'
    hospital.approvedAt = null

    const updated = await hospital.save()

    return res.status(200).json({
      message: 'Hospital updated, awaiting re-approval',
      hospital: updated,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error updating hospital' })
  }
})

router.post(
  '/upload-image',
  protect,
  hospitalAdminOnly,
  upload.single('coverImage'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' })
      }

      // Cloudinary URL is automatically attached to req.file by multer-storage-cloudinary
      return res.status(200).json({ url: req.file.path })
    } catch (err) {
      console.error(err)
      return res.status(500).json({ message: 'Image upload failed' })
    }
  },
)

export default router
