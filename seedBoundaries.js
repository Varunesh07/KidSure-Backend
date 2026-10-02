import mongoose from 'mongoose'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Boundary from './models/Boundary.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const seedBoundaries = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('Connected to MongoDB Atlas for Boundary Seeding')

    const dataPath = path.join(__dirname, 'data', 'districtBoundaries.json')
    const rawData = fs.readFileSync(dataPath, 'utf-8')
    const boundaries = JSON.parse(rawData)

    for (const b of boundaries) {
      await Boundary.findOneAndUpdate(
        { name: b.name },
        { ...b },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
    }

    const count = await Boundary.countDocuments()
    console.log(`Successfully seeded ${count} district boundaries into city_boundaries collection.`)
    process.exit(0)
  } catch (err) {
    console.error('Error seeding boundaries:', err)
    process.exit(1)
  }
}

seedBoundaries()
