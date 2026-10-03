# KidSure — Backend API

A high-performance, location-aware paediatric healthcare discovery platform. Built with the **MERN** stack, KidSure empowers parents and guardians to instantly locate the most appropriate pediatric facilities for their child's specific medical conditions — featuring real-time geospatial search, AI clinical triage, interactive district boundary analytics, and multi-role hospital management.

> **Latest Update**: Recently merged with `feature/hospital-discovery`, expanding the platform from city-level search into a full state-wide geospatial intelligence system covering all 38 districts of Tamil Nadu with 1,021 facilities, district boundary polygons, resilient hybrid AI triage, and adaptive 50 km proximity fallback.

---

## Key Features

### 🌟 Recently Integrated (`feature/hospital-discovery`)
- **State-Wide Pediatric Healthcare Dataset**:
  - Expanded coverage to **1,021 validated healthcare facilities** across all **38 districts of Tamil Nadu** (PHCs, CHCs, Sub-District Hospitals, District HQs, Government Medical Colleges, and private tertiary pediatric centers).
  - Rich facility metadata: pediatric bed capacity, NICU/PICU availability, 24/7 emergency readiness, ventilator support, and pediatric surgery units.
- **Geospatial Boundary Intelligence (38 Districts)**:
  - Full GeoJSON MultiPolygon boundary support stored with MongoDB `2dsphere` spatial indexing.
  - Spatial containment queries (`$geoWithin`) and district-level hospital aggregations.
- **Adaptive Proximity Fallback Engine (10 km ➔ 50 km)**:
  - Automatically expands the query radius from 10 km to 50 km when local pediatric facilities are sparse, ensuring parents in rural and semi-urban areas always find emergency care.
- **Resilient Hybrid Clinical NLP & AI Triage**:
  - Powered by Groq LLM (`openai/gpt-oss-20b`) with a 3-second timeout circuit breaker.
  - **Offline Clinical NLP Fallback**: Guaranteed zero-downtime triage through an internal clinical keyword rule engine that classifies pediatric conditions (respiratory distress, neonatal fever, trauma, dehydration, seizures) even when API limits or external networks fail.

### 🛡️ Core & Existing Features
- **JWT Authentication & RBAC**:
  - Secure role-based access control with three privilege tiers: `user`, `hospital_admin`, and `superadmin`.
- **Google OAuth 2.0 Integration**:
  - Seamless one-tap authentication verified against Google APIs.
- **Geospatial Proximity Queries**:
  - Spherical distance calculations (`$nearSphere`) with accurate kilometer distance computation.
- **Symptom-to-Specialisation Matching Engine**:
  - Clinical symptom matching algorithm scoring facilities by medical relevance and distance.
- **Hospital Lifecycle & Approval Workflow**:
  - Hospital administrators can submit listings and update details; superadmins review, approve, or reject submissions with feedback.
- **Star Ratings & Reviews**:
  - Compound indexed user rating system with atomic running average recalculation.
- **Saved Hospitals**:
  - Bookmarking system allowing users to save and quickly access preferred facilities.
- **Cloudinary Media Storage**:
  - Automated image optimization and storage for hospital photographs.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (ES Modules) |
| **Framework** | Express.js |
| **Database** | MongoDB Atlas (with `2dsphere` spatial indexing) |
| **ODM** | Mongoose |
| **Authentication** | JSON Web Tokens (JWT) + bcryptjs + Google Auth Library |
| **AI / NLP** | Groq SDK (`openai/gpt-oss-20b`) + Rule-Based Clinical NLP |
| **Spatial / GIS** | GeoJSON + Turf.js / MongoDB Spatial Operators |
| **Media Storage** | Cloudinary + Multer Storage Cloudinary |

---

## Project Structure

```text
server/
├── data/
│   ├── all_district_boundaries.json  # 38 Tamil Nadu district boundary GeoJSONs
│   └── districtBoundaries.json       # Core district boundary definitions
├── middleware/
│   ├── authMiddleware.js             # protect, hospitalAdminOnly, superAdminOnly
│   └── upload.js                     # Cloudinary multer upload configuration
├── models/
│   ├── Boundary.js                   # 2dsphere GeoJSON boundary polygons
│   ├── Hospital.js                   # Hospital schema with 2dsphere Point coordinates
│   ├── Rating.js                     # Star ratings with unique compound index
│   ├── Symptom.js                    # Categorized clinical symptoms & specialization weights
│   └── User.js                       # User authentication, roles, and saved hospitals
├── routes/
│   ├── admin.js                      # Hospital approval/rejection & user role promotion
│   ├── auth.js                       # Register, login, Google OAuth, and /me
│   ├── hospitals.js                  # Proximity search, 50km fallback, details, submit
│   ├── ratings.js                    # Star rating submissions and queries
│   ├── spatial.js                    # District boundary queries and spatial containment
│   ├── symptoms.js                   # Groq LLM + offline clinical NLP triage & matching
│   └── user.js                       # Saved hospital toggles and user profile
├── importHospitals.js                # Dataset transformation & import pipeline (1,021 facilities)
├── seedBoundaries.js                 # District boundary polygon seeder
├── seedSymptoms.js                   # Clinical symptom taxonomy seeder
├── index.js                          # Express application entry point & CORS
└── .env                              # Environment configuration
```

---

## Getting Started

### Prerequisites
- Node.js v18.x or above
- A MongoDB Atlas cluster (with support for `2dsphere` indexes)
- A Cloudinary account (for image uploads)
- A Groq API key (optional — offline clinical triage operates independently)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Varunesh07/KidSure-Backend.git
   cd KidSure-Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables (`.env`):**
   Create a `.env` file in the root directory:
   ```env
   # MongoDB Atlas Connection URI
   MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?appName=Cluster0

   # Server Port & Secret
   PORT=5000
   JWT_SECRET=your_long_random_secret_token_here

   # Client Origin
   CLIENT_URL=http://localhost:5173

   # Groq Cloud API Key
   GROQ_API_KEY=gsk_your_groq_api_key_here

   # Google OAuth Client ID
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

   # Cloudinary Media Storage
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_key
   CLOUDINARY_API_SECRET=your_cloudinary_secret
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

   Expected output:
   ```text
   Connected to MongoDB Atlas
   Server running on port 5000
   ```

---

## Data Pipelines & Seeding

The platform includes automated scripts to seed facilities, district boundaries, and clinical symptoms:

- **1,021 Healthcare Facilities**:
  ```bash
  node importHospitals.js
  ```
- **38 District Polygon Boundaries**:
  ```bash
  node seedBoundaries.js
  ```
- **Clinical Symptoms & Urgency Weights**:
  ```bash
  node seedSymptoms.js
  ```

---

## API Reference

### Geospatial & Hospital Routes (`/api/hospitals`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/nearby?lat=&lng=&radius=` | Proximity search with automatic 10km ➔ 50km fallback | Public |
| `GET` | `/search?q=&category=&district=` | Full-text and district/category search | Public |
| `GET` | `/:id` | Full hospital details & pediatric capabilities | Public |
| `POST` | `/submit` | Submit a new hospital listing | Hospital Admin |
| `PUT` | `/:id/edit` | Update hospital details | Hospital Admin |

### Spatial & Boundary Intelligence (`/api/spatial`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/boundaries` | All 38 district GeoJSON polygon boundaries | Public |
| `GET` | `/boundaries/:district` | Specific district GeoJSON polygon | Public |
| `GET` | `/containment?lat=&lng=` | Detects district from coordinates via `$geoWithin` | Public |

### Symptom Triage & AI Routing (`/api/symptoms`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/` | Retrieve all 27 clinical symptoms grouped by system | Public |
| `POST` | `/match` | Rank hospitals matching selected symptoms + coordinates | Public |
| `POST` | `/analyze` | Hybrid Groq LLM + offline clinical NLP triage | Public |

### Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `POST` | `/register` | Create a new user account | Public |
| `POST` | `/login` | Authenticate with email/password and obtain JWT | Public |
| `POST` | `/google` | Google OAuth 2.0 one-tap authentication | Public |
| `GET` | `/me` | Get current authenticated user profile | User |

### Administration (`/api/admin`)
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| `GET` | `/pending` | List submitted hospitals awaiting approval | Superadmin |
| `PUT` | `/approve/:id` | Approve hospital listing for public discovery | Superadmin |
| `PUT` | `/reject/:id` | Reject submission with explanation | Superadmin |
| `GET` | `/users` | List all users and managed hospitals | Superadmin |
| `PUT` | `/promote/:id` | Update user access role | Superadmin |

---

## Deployment Configuration

- **Render / Production Hosting**: Ensure `MONGO_URI` points to the active Atlas cluster containing the `2dsphere` indexes.
- **CORS Handling**: Configured with dynamic origin resolution (`origin: true`, `credentials: true`) to support web, mobile, and custom domains without cross-origin friction.
