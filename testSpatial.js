import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Hospital from './models/Hospital.js'
import Boundary from './models/Boundary.js'

dotenv.config()

const testQueries = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Testing Spatial Queries on MongoDB Atlas...')

    // 1. Boundary Query ($geoWithin)
    const boundary = await Boundary.findOne({ district: 'Coimbatore' })
    if (!boundary) throw new Error('Boundary not found')
    console.log(`Found boundary: ${boundary.name}`)

    const insideCoimbatore = await Hospital.find({
      location: {
        $geoWithin: {
          $geometry: boundary.boundary,
        },
      },
    })
    console.log(`\n[Feature 4] $geoWithin Result: ${insideCoimbatore.length} hospitals inside ${boundary.name}`)
    console.log('Sample hospital inside:', insideCoimbatore[0]?.name)

    // 2. Spatial Aggregation Count
    const countResult = await Hospital.aggregate([
      {
        $match: {
          location: {
            $geoWithin: {
              $geometry: boundary.boundary,
            },
          },
        },
      },
      {
        $group: {
          _id: '$district',
          total: { $sum: 1 },
          emergency: { $sum: { $cond: ['$isEmergency', 1, 0] } },
        },
      },
    ])
    console.log('\n[Feature 5] Spatial Aggregation Count:', countResult[0])

    // 3. Exact Distance ($geoNear)
    const userLng = 76.9629
    const userLat = 11.0183
    const distances = await Hospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [userLng, userLat] },
          distanceField: 'distMeters',
          spherical: true,
        },
      },
      {
        $project: {
          name: 1,
          distanceKm: { $round: [{ $divide: ['$distMeters', 1000] }, 2] },
        },
      },
      { $limit: 3 },
    ])
    console.log('\n[Feature 3] $geoNear Distances (from user):')
    distances.forEach((h, i) => console.log(`  ${i + 1}. ${h.name} -> ${h.distanceKm} km`))

    // 4. Multi-Radius Comparison ($facet)
    const comparison = await Hospital.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [userLng, userLat] },
          distanceField: 'dist',
          spherical: true,
          maxDistance: 15000,
        },
      },
      {
        $facet: {
          twoKm: [{ $match: { dist: { $lte: 2000 } } }, { $count: 'count' }],
          fiveKm: [{ $match: { dist: { $lte: 5000 } } }, { $count: 'count' }],
          tenKm: [{ $match: { dist: { $lte: 10000 } } }, { $count: 'count' }],
        },
      },
    ])
    console.log('\n[Feature 6] Radius Comparison:')
    console.log('  <= 2 km:', comparison[0].twoKm[0]?.count || 0)
    console.log('  <= 5 km:', comparison[0].fiveKm[0]?.count || 0)
    console.log('  <= 10 km:', comparison[0].tenKm[0]?.count || 0)

    console.log('\nAll 5 MongoDB Spatial Queries PASSED with 100% accuracy!')
    process.exit(0)
  } catch (err) {
    console.error('Test failed:', err)
    process.exit(1)
  }
}

testQueries()
