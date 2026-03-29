import express from 'express'
import Symptom from '../models/Symptom.js'
import Hospital from '../models/Hospital.js'
import { protect, superAdminOnly } from '../middleware/authMiddleware.js'

const router = express.Router()

// GET /api/symptoms
// returns all symptoms grouped by category
// React uses this to render the symptom selection UI
router.get('/', protect, async (req, res) => {
  try {
    const symptoms = await Symptom.find().sort({ category: 1, name: 1 })

    // group by category so React can render them as sections
    const grouped = symptoms.reduce((acc, symptom) => {
      const cat = symptom.category
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({
        _id: symptom._id,
        name: symptom.name,
        specialisationTags: symptom.specialisationTags,
      })
      return acc
    }, {})

    return res.status(200).json(grouped)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error fetching symptoms' })
  }
})

// POST /api/symptoms/match
// the core algorithm — takes selected symptom ids + location
// returns top 5 hospitals sorted by match score + proximity
router.post('/match', protect, async (req, res) => {
  try {
    const { symptomIds, lng, lat, radius = 10000 } = req.body
    // wider radius here (10km) since we're filtering by match score too

    if (!symptomIds || symptomIds.length === 0) {
      return res.status(400).json({ message: 'Select at least one symptom' })
    }

    if (!lng || !lat) {
      return res.status(400).json({ message: 'Location is required' })
    }

    // step 1 — fetch the selected symptoms with their specialisation weights
    const symptoms = await Symptom.find({ _id: { $in: symptomIds } })

    if (symptoms.length === 0) {
      return res.status(404).json({ message: 'No matching symptoms found' })
    }

    // step 2 — build a score map: { specialisation: totalWeight }
    // loop every selected symptom, loop its tags, sum weights per specialisation
    const scoreMap = {}
    symptoms.forEach((symptom) => {
      symptom.specialisationTags.forEach((tag) => {
        if (!scoreMap[tag.specialisation]) scoreMap[tag.specialisation] = 0
        scoreMap[tag.specialisation] += tag.weight
      })
    })

    // step 3 — find the top scoring specialisations
    // sort by score descending, take top 2
    const topSpecialisations = Object.entries(scoreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([spec]) => spec)

    // step 4 — geo query hospitals that have those specialisations nearby
    const hospitals = await Hospital.find({
      status: 'approved',
      categories: { $in: topSpecialisations },
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: parseFloat(radius),
        },
      },
    }).limit(20)
    // fetch 20 then we score and slice to top 5 below

    if (hospitals.length === 0) {
      return res
        .status(404)
        .json({ message: 'No hospitals found nearby for these symptoms' })
    }

    // step 5 — score each hospital based on how many matching
    // specialisations it covers, weighted by symptom score
    const scored = hospitals.map((hospital) => {
      let matchScore = 0
      hospital.categories.forEach((cat) => {
        if (scoreMap[cat]) matchScore += scoreMap[cat]
      })
      return {
        ...hospital.toObject(),
        matchScore,
      }
    })

    // step 6 — sort by match score descending, return top 5
    const top5 = scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5)

    // step 7 — also return which specialisations were matched
    // so React can show "Matched: Paediatric + ENT" badge
    return res.status(200).json({
      matchedSpecialisations: topSpecialisations,
      hospitals: top5,
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error matching symptoms' })
  }
})

// POST /api/symptoms/seed
// superadmin only — populates the symptoms collection
// you call this once after deployment, never again
router.post('/seed', protect, superAdminOnly, async (req, res) => {
  try {
    await Symptom.deleteMany() // clear existing symptoms first

    const symptoms = [
      // Head & Fever
      {
        name: 'High fever',
        category: 'Head & Fever',
        specialisationTags: [
          { specialisation: 'Paediatric', weight: 5 },
          { specialisation: 'General', weight: 4 },
        ],
      },
      {
        name: 'Headache',
        category: 'Head & Fever',
        specialisationTags: [
          { specialisation: 'Neurology', weight: 4 },
          { specialisation: 'General', weight: 3 },
        ],
      },
      {
        name: 'Ear pain',
        category: 'Head & Fever',
        specialisationTags: [
          { specialisation: 'ENT', weight: 5 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },
      {
        name: 'Runny nose',
        category: 'Head & Fever',
        specialisationTags: [
          { specialisation: 'ENT', weight: 4 },
          { specialisation: 'General', weight: 3 },
        ],
      },
      {
        name: 'Sore throat',
        category: 'Head & Fever',
        specialisationTags: [
          { specialisation: 'ENT', weight: 5 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },

      // Breathing
      {
        name: 'Wheezing',
        category: 'Breathing',
        specialisationTags: [
          { specialisation: 'Paediatric', weight: 5 },
          { specialisation: 'General', weight: 3 },
        ],
      },
      {
        name: 'Cough',
        category: 'Breathing',
        specialisationTags: [
          { specialisation: 'General', weight: 4 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },
      {
        name: 'Breathlessness',
        category: 'Breathing',
        specialisationTags: [
          { specialisation: 'Emergency', weight: 5 },
          { specialisation: 'Paediatric', weight: 4 },
        ],
      },
      {
        name: 'Chest tightness',
        category: 'Breathing',
        specialisationTags: [
          { specialisation: 'Emergency', weight: 5 },
          { specialisation: 'General', weight: 3 },
        ],
      },

      // Stomach
      {
        name: 'Vomiting',
        category: 'Stomach',
        specialisationTags: [
          { specialisation: 'Paediatric', weight: 5 },
          { specialisation: 'General', weight: 4 },
        ],
      },
      {
        name: 'Stomach pain',
        category: 'Stomach',
        specialisationTags: [
          { specialisation: 'General', weight: 4 },
          { specialisation: 'Surgery', weight: 3 },
        ],
      },
      {
        name: 'Diarrhoea',
        category: 'Stomach',
        specialisationTags: [
          { specialisation: 'Paediatric', weight: 5 },
          { specialisation: 'General', weight: 4 },
        ],
      },
      {
        name: 'Constipation',
        category: 'Stomach',
        specialisationTags: [
          { specialisation: 'General', weight: 4 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },

      // Skin
      {
        name: 'Rash',
        category: 'Skin',
        specialisationTags: [
          { specialisation: 'Dermatology', weight: 5 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },
      {
        name: 'Swelling',
        category: 'Skin',
        specialisationTags: [
          { specialisation: 'General', weight: 4 },
          { specialisation: 'Emergency', weight: 3 },
        ],
      },
      {
        name: 'Itching',
        category: 'Skin',
        specialisationTags: [
          { specialisation: 'Dermatology', weight: 5 },
          { specialisation: 'General', weight: 2 },
        ],
      },
      {
        name: 'Skin burns',
        category: 'Skin',
        specialisationTags: [
          { specialisation: 'Emergency', weight: 5 },
          { specialisation: 'Dermatology', weight: 4 },
        ],
      },

      // Eyes & Ears
      {
        name: 'Eye redness',
        category: 'Eyes & Ears',
        specialisationTags: [
          { specialisation: 'ENT', weight: 4 },
          { specialisation: 'General', weight: 3 },
        ],
      },
      {
        name: 'Ear discharge',
        category: 'Eyes & Ears',
        specialisationTags: [
          { specialisation: 'ENT', weight: 5 },
          { specialisation: 'Paediatric', weight: 3 },
        ],
      },
      {
        name: 'Hearing loss',
        category: 'Eyes & Ears',
        specialisationTags: [
          { specialisation: 'ENT', weight: 5 },
          { specialisation: 'Neurology', weight: 2 },
        ],
      },

      // Bones & Joints
      {
        name: 'Joint pain',
        category: 'Bones & Joints',
        specialisationTags: [
          { specialisation: 'Orthopaedic', weight: 5 },
          { specialisation: 'General', weight: 3 },
        ],
      },
      {
        name: 'Fracture',
        category: 'Bones & Joints',
        specialisationTags: [
          { specialisation: 'Orthopaedic', weight: 5 },
          { specialisation: 'Emergency', weight: 5 },
        ],
      },
      {
        name: 'Limb swelling',
        category: 'Bones & Joints',
        specialisationTags: [
          { specialisation: 'Orthopaedic', weight: 4 },
          { specialisation: 'Emergency', weight: 3 },
        ],
      },

      // Neurological
      {
        name: 'Seizure',
        category: 'Neurological',
        specialisationTags: [
          { specialisation: 'Neurology', weight: 5 },
          { specialisation: 'Emergency', weight: 5 },
        ],
      },
      {
        name: 'Fainting',
        category: 'Neurological',
        specialisationTags: [
          { specialisation: 'Emergency', weight: 5 },
          { specialisation: 'Neurology', weight: 4 },
        ],
      },
      {
        name: 'Dizziness',
        category: 'Neurological',
        specialisationTags: [
          { specialisation: 'Neurology', weight: 4 },
          { specialisation: 'ENT', weight: 3 },
        ],
      },
      {
        name: 'Blurred vision',
        category: 'Neurological',
        specialisationTags: [
          { specialisation: 'Neurology', weight: 4 },
          { specialisation: 'Emergency', weight: 3 },
        ],
      },
    ]

    await Symptom.insertMany(symptoms)

    return res
      .status(201)
      .json({ message: `${symptoms.length} symptoms seeded successfully` })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: 'Server error seeding symptoms' })
  }
})

export default router
