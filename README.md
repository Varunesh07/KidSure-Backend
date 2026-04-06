# KidSure — Backend API

A location-aware paediatric hospital finder. Parents travelling to an unfamiliar city can enter their child's symptoms and instantly find the nearest, most relevant hospitals — with real-time open/closed status, star ratings, and map support.

Built with the MERN stack. This repository contains the Express + MongoDB backend only.



---

## Features

- JWT-based authentication with role system (`user`, `hospital_admin`, `superadmin`)
- Google OAuth 2.0 integration for seamless one-tap login and registration
- Geospatial hospital search using MongoDB `$near` and `2dsphere` index
- AI-Powered Symptom Checking — uses Groq LPU (Llama 3) to parse natural language descriptions into specialisation categories
- Symptom-to-specialisation matching algorithm — returns top 5 hospitals scored by relevance + proximity
- Hospital submission and approval workflow — hospital admins submit, superadmin approves
- Star ratings with automatic average recalculation
- Save/unsave hospitals per user
- Cloudinary image upload for hospital cover photos
- Fully seeded with 20 real Coimbatore hospitals and 27 categorised symptoms

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB Atlas |
| ODM | Mongoose |
| Auth | JSON Web Tokens (JWT) + bcryptjs |
| Image Storage | Cloudinary |
| File Upload | Multer + multer-storage-cloudinary |

---

## Project Structure

```
server/
├── models/
│   ├── Hospital.js         # GeoJSON location, categories, operating hours
│   ├── User.js             # Roles, saved hospitals, managed hospital
│   ├── Symptom.js          # Symptom categories with specialisation weights
│   └── Rating.js           # Star ratings with compound unique index
├── routes/
│   ├── auth.js             # Register, login, /me
│   ├── hospitals.js        # Nearby, search, detail, submit, edit
│   ├── symptoms.js         # Get all symptoms, symptom match algorithm
│   ├── ratings.js          # Submit rating, check user rating
│   ├── user.js             # Saved hospitals toggle
│   └── admin.js            # Approve, reject, delete, promote users
├── middleware/
│   ├── authMiddleware.js   # protect, hospitalAdminOnly, superAdminOnly
│   └── upload.js           # Cloudinary multer config
├── seed.js                 # One-time hospital seed script
├── .env                    # Environment variables (not committed)
├── .gitignore
└── index.js                # Express app entry point
```

---

## Getting Started

### Prerequisites

- Node.js v18 or above
- A free [MongoDB Atlas](https://cloud.mongodb.com) account
- A free [Cloudinary](https://cloudinary.com) account

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Varunesh07/KidSure-Backend.git
cd KidSure-Backend
```

**2. Install dependencies**
```bash
npm install
```

**3. Create a `.env` file** in the root of the project:
```env
MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/pediatric-app
JWT_SECRET=your_long_random_secret_key
PORT=5000
CLIENT_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GROQ_API_KEY=your_groq_api_key
```

> Get `MONGO_URI` from Atlas → Clusters → Connect → Drivers.  
> Get Cloudinary credentials from your Cloudinary dashboard.

**4. Add `"type": "module"` to `package.json`**
```json
{
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "seed": "node seed.js"
  }
}
```

**5. Start the development server**
```bash
npm run dev
```

You should see:
```
Connected to MongoDB Atlas
Server running on port 5000
```

---

## Seeding Data

After the server connects successfully, run the seed script once to populate 20 Coimbatore hospitals:

```bash
npm run seed
```

To seed symptoms, first register an account, manually set its role to `superadmin` in Atlas, then call:

```
POST http://localhost:5000/api/symptoms/seed
Authorization: Bearer <superadmin_token>
```

---

## Setting Up Superadmin

The `superadmin` role cannot be assigned through the API for security reasons. To create one:

1. Register a normal account via `POST /api/auth/register`
2. Go to MongoDB Atlas → Collections → users
3. Find your document → change `role` field to `"superadmin"` → save

You only need one superadmin account. All admin routes are protected and only accessible with this role.

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens — make it long and random |
| `PORT` | Port for Express server (default: 5000) |
| `CLIENT_URL` | Frontend URL for CORS — use `http://localhost:5173` locally |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard — never expose this |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console (OAuth 2.0 Client IDs), used for Google Sign-In backend verification |
| `GROQ_API_KEY` | Your Groq API key used for the AI symptom analyzer |

---

## API Overview

Full API documentation with request/response examples is in [`API_DOCUMENTATION.md`](./API_DOCUMENTATION.md).

### Quick reference

| Method | Route | Description | Auth |
|--------|-------|-------------|------|
| POST | `/api/auth/register` | Create account | Public |
| POST | `/api/auth/login` | Login, get token | Public |
| POST | `/api/auth/google` | Google OAuth one-tap Sign-In/Register | Public |
| GET | `/api/auth/me` | Get current user | User |
| GET | `/api/hospitals/nearby` | Hospitals near location | User |
| GET | `/api/hospitals/search` | Filter by category + distance | User |
| GET | `/api/hospitals/:id` | Hospital detail | User |
| POST | `/api/hospitals/submit` | Submit new hospital | Hospital admin |
| PUT | `/api/hospitals/:id/edit` | Edit own listing | Hospital admin |
| POST | `/api/symptoms/match` | Top 5 hospitals for symptoms | User |
| POST | `/api/symptoms/analyze` | AI analysis of natural language symptoms using Groq | User |
| GET | `/api/symptoms` | All symptoms grouped | User |
| POST | `/api/ratings/:hospitalId` | Submit star rating | User |
| GET | `/api/ratings/:hospitalId/mine` | Check own rating | User |
| POST | `/api/user/saved/:hospitalId` | Toggle save hospital | User |
| GET | `/api/user/saved` | Get saved hospitals | User |
| GET | `/api/admin/pending` | View pending hospitals | Superadmin |
| PUT | `/api/admin/approve/:id` | Approve hospital | Superadmin |
| PUT | `/api/admin/reject/:id` | Reject with reason | Superadmin |
| DELETE | `/api/admin/delete/:id` | Delete hospital | Superadmin |
| GET | `/api/admin/users` | View all users | Superadmin |

---

## Roles and Permissions

| Role | Can do |
|------|--------|
| `user` | Search hospitals, view details, rate, save |
| `hospital_admin` | All user permissions + submit and edit own hospital listing |
| `superadmin` | All permissions + approve/reject listings, manage users |

---

