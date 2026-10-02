import mongoose from 'mongoose'

const boundarySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    boundaryType: {
      type: String,
      default: 'City Boundary',
    },
    boundary: {
      type: {
        type: String,
        enum: ['Polygon', 'MultiPolygon'],
        required: true,
      },
      coordinates: {
        type: Array,
        required: true,
      },
    },
  },
  { timestamps: true }
)

boundarySchema.index({ boundary: '2dsphere' })

const Boundary = mongoose.model('Boundary', boundarySchema, 'city_boundaries')

export default Boundary
