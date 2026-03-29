import mongoose from 'mongoose'

const operatingHourSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ],
    required: true,
  },
  openTime: {
    type: String, // store as "08:00" 24hr format
  },
  closeTime: {
    type: String, // store as "21:00"
  },
  isOpen: {
    type: Boolean,
    default: true,
  },
})

const hospitalSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
    },

    coverImage: {
      type: String, // Unsplash URL string
      default: '',
    },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude] — MongoDB always longitude first
        required: true,
      },
    },

    categories: [
      {
        type: String,
        enum: [
          'Paediatric',
          'General',
          'Emergency',
          'Surgery',
          'ENT',
          'Dermatology',
          'Orthopaedic',
          'Neurology',
        ],
      },
    ],

    operatingHours: [operatingHourSchema],

    is24x7: {
      type: Boolean,
      default: false,
    },

    isEmergency: {
      type: Boolean,
      default: false,
    },

    avgRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },

    ratingCount: {
      type: Number,
      default: 0,
    },

    // for hospital submission flow
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    rejectionReason: {
      type: String,
      default: '',
    },

    approvedAt: {
      type: Date,
    },
  },
  { timestamps: true },
) // adds createdAt and updatedAt automatically

// this one line creates the 2dsphere index on Atlas automatically
hospitalSchema.index({ location: '2dsphere' })

const Hospital = mongoose.model('Hospital', hospitalSchema)

export default Hospital
