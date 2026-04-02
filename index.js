import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cors from 'cors'

// routes (we'll create these next)
import authRoutes from './routes/auth.js'
import hospitalRoutes from './routes/hospitals.js'
import symptomRoutes from './routes/symptoms.js'
import ratingRoutes from './routes/ratings.js'
import adminRoutes from './routes/admin.js'
import userRoutes from './routes/user.js'

const app = express()

// middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173', // Vite runs on 5173 by default
  }),
)
app.use(express.json()) // lets Express read req.body as JSON

// routes
app.use('/api/auth', authRoutes)
app.use('/api/hospitals', hospitalRoutes)
app.use('/api/symptoms', symptomRoutes)
app.use('/api/ratings', ratingRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/user', userRoutes)

// health check — Render and UptimeRobot ping this to keep the server awake
app.get('/', (req, res) => {
  res.json({ message: 'Pediatric Finder API is running' })
})

// connect to MongoDB Atlas then start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas')
    app.listen(process.env.PORT || 5000, () => {
      console.log(`Server running on port ${process.env.PORT || 5000}`)
    })
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message)
    process.exit(1) // crash the process so Render knows something is wrong
  })
