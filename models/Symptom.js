import mongoose from 'mongoose'

const specialisationTagSchema = new mongoose.Schema({
  specialisation: {
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
    required: true,
  },
  weight: {
    type: Number,
    required: true,
    min: 1,
    max: 5, // 5 = strongly indicates this specialisation, 1 = loosely related
  },
})

const symptomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    category: {
      type: String,
      enum: [
        'Head & Fever',
        'Breathing',
        'Stomach',
        'Skin',
        'Eyes & Ears',
        'Bones & Joints',
        'Neurological',
        'Other',
      ],
      required: true,
    },

    specialisationTags: [specialisationTagSchema],
  },
  { timestamps: true },
)

const Symptom = mongoose.model('Symptom', symptomSchema)

export default Symptom
