import mongoose from 'mongoose'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Hospital from './models/Hospital.js'
import User from './models/User.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const importHospitals = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected to MongoDB Atlas')

    // Find superadmin user for submittedBy
    const admin = await User.findOne({ role: 'superadmin' })
    if (!admin) {
      console.error('No superadmin found in database. Please register/promote a superadmin first.')
      process.exit(1)
    }

    // Step 1: Ensure existing seeded Coimbatore hospitals have district = 'Coimbatore'
    const updatedExisting = await Hospital.updateMany(
      { district: { $in: ['', null] } },
      { $set: { district: 'Coimbatore' } }
    )
    console.log(`Updated ${updatedExisting.modifiedCount} existing hospitals with district = 'Coimbatore'`)

    // Step 2: Read the 1,000 hospitals dataset
    const jsonPath = path.resolve(__dirname, '..', 'tamil_nadu_1000_hospitals.json')
    if (!fs.existsSync(jsonPath)) {
      console.error(`Cannot find dataset file at ${jsonPath}`)
      process.exit(1)
    }

    console.log(`Reading hospital dataset from ${jsonPath}...`)
    const rawData = fs.readFileSync(jsonPath, 'utf-8')
    const hospitalList = JSON.parse(rawData)
    console.log(`Found ${hospitalList.length} hospitals in dataset.`)

    // Prepare bulk write operations for maximum efficiency and idempotency
    const bulkOps = hospitalList.map((h) => ({
      updateOne: {
        filter: {
          name: h.name,
          'location.coordinates': h.coordinates,
        },
        update: {
          $set: {
            name: h.name,
            address: h.address,
            district: h.district || 'Tamil Nadu',
            phone: h.phone || '044-0000000',
            coverImage: h.coverImage || '',
            location: {
              type: 'Point',
              coordinates: h.coordinates, // [lng, lat]
            },
            categories: h.categories || ['General'],
            operatingHours: h.operatingHours || [],
            is24x7: h.is24x7 || false,
            isEmergency: h.isEmergency || false,
            status: 'approved',
            submittedBy: admin._id,
            approvedAt: new Date(),
          },
        },
        upsert: true,
      },
    }))

    console.log('Executing bulk write to MongoDB Atlas...')
    const result = await Hospital.bulkWrite(bulkOps, { ordered: false })
    console.log('Bulk write completed successfully:')
    console.log(`- Inserted / Upserted: ${result.upsertedCount}`)
    console.log(`- Matched / Updated: ${result.matchedCount}`)

    const totalCount = await Hospital.countDocuments()
    console.log(`\n🎉 Total hospitals in KidSure database: ${totalCount}`)

    process.exit(0)
  } catch (err) {
    console.error('Error importing hospitals:', err)
    process.exit(1)
  }
}

importHospitals()
