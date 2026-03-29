import mongoose from 'mongoose'

const ratingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      required: true,
    },

    stars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
  },
  { timestamps: true },
)

// prevents the same user from rating the same hospital twice
ratingSchema.index({ user: 1, hospital: 1 }, { unique: true })

const Rating = mongoose.model('Rating', ratingSchema)

export default Rating
