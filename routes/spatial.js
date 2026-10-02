import express from 'express'
import Hospital from '../models/Hospital.js'
import Boundary from '../models/Boundary.js'
import { protect, superAdminOnly } from '../middleware/authMiddleware.js'

const router = express.Router()

// 1. GET /api/spatial/boundaries
// Returns all stored boundary polygons (for Leaflet overlay selection)
router.get('/boundaries', protect, async (req, res) => {
  try {
    const boundaries = await Boundary.find().select('name district boundaryType boundary')
    return res.status(200).json({ count: boundaries.length, boundaries })
  } catch (err) {
    console.error('Error fetching boundaries:', err)
    return res.status(500).json({ message: 'Server error fetching boundaries' })
  }
})

// 2. GET /api/spatial/within-boundary
// Feature: Containment query using $geoWithin to find hospitals inside a polygon
router.get('/within-boundary', protect, async (req, res) => {
  try {
    const { district = 'Coimbatore' } = req.query

    // Case-insensitive regex match for district name
    const boundaryDoc = await Boundary.findOne({
      $or: [
        { district: new RegExp(`^${district}$`, 'i') },
        { name: new RegExp(district, 'i') },
      ],
    })

    if (!boundaryDoc) {
      return res.status(404).json({ message: `No boundary polygon found for district: ${district}` })
    }

    const hospitals = await Hospital.find({
      status: 'approved',
      location: {
        $geoWithin: {
          $geometry: boundaryDoc.boundary,
        },
      },
    }).select('name address district phone categories location avgRating ratingCount is24x7 isEmergency operatingHours coverImage')

    return res.status(200).json({
      district: boundaryDoc.district,
      boundaryName: boundaryDoc.name,
      totalInside: hospitals.length,
      boundary: boundaryDoc.boundary,
      hospitals,
    })
  } catch (err) {
    console.error('Error in $geoWithin query:', err)
    return res.status(500).json({ message: 'Server error executing $geoWithin query' })
  }
})

// 2b. GET /api/spatial/smart-nearby
// Production Proximity: Dynamic 10km search with automatic fallback expansion to 50km
router.get('/smart-nearby', protect, async (req, res) => {
  try {
    const { lng, lat, initialRadius = 10000, maxRadius = 50000, limit = 50 } = req.query

    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat coordinates are required' })
    }

    const parsedLng = parseFloat(lng)
    const parsedLat = parseFloat(lat)
    const initRad = parseFloat(initialRadius)
    const maxRad = parseFloat(maxRadius)
    const parsedLimit = parseInt(limit)

    const runGeoNear = async (radiusMeters) => {
      return await Hospital.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [parsedLng, parsedLat],
            },
            distanceField: 'distanceMeters',
            spherical: true,
            maxDistance: radiusMeters,
            query: { status: 'approved' },
          },
        },
        {
          $project: {
            name: 1,
            address: 1,
            district: 1,
            phone: 1,
            categories: 1,
            location: 1,
            avgRating: 1,
            ratingCount: 1,
            is24x7: 1,
            isEmergency: 1,
            operatingHours: 1,
            coverImage: 1,
            distanceMeters: { $round: ['$distanceMeters', 0] },
            distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
          },
        },
        { $limit: parsedLimit },
      ])
    }

    // Step 1: Initial proximity query (10km default)
    let hospitals = await runGeoNear(initRad)
    let autoExpanded = false
    let radiusUsedKm = initRad / 1000

    // Step 2: Auto-expansion if no hospitals found
    if (hospitals.length === 0 && maxRad > initRad) {
      hospitals = await runGeoNear(maxRad)
      if (hospitals.length > 0) {
        autoExpanded = true
        radiusUsedKm = maxRad / 1000
      }
    }

    return res.status(200).json({
      userLocation: { lng: parsedLng, lat: parsedLat },
      count: hospitals.length,
      radiusUsedKm,
      autoExpanded,
      message: autoExpanded
        ? `No hospitals found within ${initRad / 1000} km. Search auto-expanded to ${radiusUsedKm} km.`
        : `Showing hospitals within ${radiusUsedKm} km.`,
      hospitals,
    })
  } catch (err) {
    console.error('Error in smart nearby query:', err)
    return res.status(500).json({ message: 'Server error in smart nearby query' })
  }
})

// 3. GET /api/spatial/boundary-count
// Feature 5: Spatial Aggregation counting hospitals inside the polygon
router.get('/boundary-count', protect, async (req, res) => {
  try {
    const { district = 'Coimbatore' } = req.query

    const boundaryDoc = await Boundary.findOne({
      $or: [
        { district: new RegExp(`^${district}$`, 'i') },
        { name: new RegExp(district, 'i') },
      ],
    })

    if (!boundaryDoc) {
      return res.status(404).json({ message: `No boundary polygon found for: ${district}` })
    }

    // Spatial aggregation count
    const result = await Hospital.aggregate([
      {
        $match: {
          location: {
            $geoWithin: {
              $geometry: boundaryDoc.boundary,
            },
          },
        },
      },
      {
        $group: {
          _id: '$district',
          totalHospitals: { $sum: 1 },
          emergencyReady: {
            $sum: { $cond: ['$isEmergency', 1, 0] },
          },
          open24x7: {
            $sum: { $cond: ['$is24x7', 1, 0] },
          },
        },
      },
    ])

    const stats = result[0] || { totalHospitals: 0, emergencyReady: 0, open24x7: 0 }

    return res.status(200).json({
      district: boundaryDoc.district,
      boundaryName: boundaryDoc.name,
      ...stats,
    })
  } catch (err) {
    console.error('Error in spatial count aggregation:', err)
    return res.status(500).json({ message: 'Server error counting hospitals inside boundary' })
  }
})

// 4. GET /api/spatial/distances
// Feature 3: Geodetic distance calculation using $geoNear aggregation pipeline
router.get('/distances', protect, async (req, res) => {
  try {
    const { lng, lat, limit = 50 } = req.query

    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat coordinates are required' })
    }

    const hospitals = await Hospital.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          distanceField: 'distanceMeters',
          spherical: true,
        },
      },
      {
        $project: {
          name: 1,
          address: 1,
          district: 1,
          phone: 1,
          categories: 1,
          location: 1,
          avgRating: 1,
          is24x7: 1,
          isEmergency: 1,
          distanceMeters: { $round: ['$distanceMeters', 0] },
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
        },
      },
      { $limit: parseInt(limit) },
    ])

    return res.status(200).json({
      userLocation: { lng: parseFloat(lng), lat: parseFloat(lat) },
      count: hospitals.length,
      hospitals,
    })
  } catch (err) {
    console.error('Error calculating $geoNear distances:', err)
    return res.status(500).json({ message: 'Server error in $geoNear calculation' })
  }
})

// 5. GET /api/spatial/radius-comparison
// Feature 6 & 2: Compare hospital counts at 2 km, 5 km, and 10 km using $facet
router.get('/radius-comparison', protect, async (req, res) => {
  try {
    const { lng, lat } = req.query

    if (!lng || !lat) {
      return res.status(400).json({ message: 'lng and lat coordinates are required' })
    }

    const comparison = await Hospital.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          distanceField: 'dist',
          spherical: true,
          maxDistance: 15000, // up to 15km
        },
      },
      {
        $facet: {
          within2km: [
            { $match: { dist: { $lte: 2000 } } },
            { $project: { name: 1, dist: { $round: [{ $divide: ['$dist', 1000] }, 2] } } },
          ],
          within5km: [
            { $match: { dist: { $lte: 5000 } } },
            { $project: { name: 1, dist: { $round: [{ $divide: ['$dist', 1000] }, 2] } } },
          ],
          within10km: [
            { $match: { dist: { $lte: 10000 } } },
            { $project: { name: 1, dist: { $round: [{ $divide: ['$dist', 1000] }, 2] } } },
          ],
        },
      },
    ])

    const data = comparison[0]

    return res.status(200).json({
      userLocation: { lng: parseFloat(lng), lat: parseFloat(lat) },
      comparison: {
        twoKm: {
          count: data.within2km.length,
          hospitals: data.within2km,
        },
        fiveKm: {
          count: data.within5km.length,
          hospitals: data.within5km,
        },
        tenKm: {
          count: data.within10km.length,
          hospitals: data.within10km,
        },
      },
    })
  } catch (err) {
    console.error('Error comparing spatial radius buckets:', err)
    return res.status(500).json({ message: 'Server error in radius comparison' })
  }
})

// 6. POST /api/spatial/crud-demo
// Feature 1: Spatial CRUD demonstration endpoint for examiner
router.post('/crud-demo', protect, async (req, res) => {
  try {
    const demoName = 'Spatial Lab Demo Hospital - ' + Date.now()

    // 1. Create
    const created = await Hospital.create({
      name: demoName,
      address: 'Demo Spatial Lane, Coimbatore 641001',
      district: 'Coimbatore',
      phone: '0422-9999999',
      location: {
        type: 'Point',
        coordinates: [76.965, 11.015],
      },
      categories: ['Paediatric', 'Emergency'],
      status: 'approved',
      submittedBy: req.user._id,
    })

    // 2. Read
    const readDoc = await Hospital.findById(created._id)

    // 3. Update coordinates
    readDoc.location.coordinates = [76.970, 11.020]
    await readDoc.save()

    // 4. Delete
    await Hospital.findByIdAndDelete(created._id)

    return res.status(200).json({
      message: 'Spatial CRUD lifecycle completed successfully',
      createdId: created._id,
      finalDeleted: true,
      testedCoordinates: [76.970, 11.020],
    })
  } catch (err) {
    console.error('Error in spatial CRUD demo:', err)
    return res.status(500).json({ message: 'Server error in spatial CRUD demo' })
  }
})

export default router
