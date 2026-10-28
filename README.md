# 🎓 Virtual Learning Platform

An interactive, web-based learning platform offering virtual labs, AI-powered mock interviews, an e-library, and structured subject modules — all backed by Firebase and a Node.js/Express server.

---

## ✨ Features

| Module | Description |
|---|---|
| 🔬 **Virtual Labs** | Hands-on interactive lab simulations for Chemistry, Physics, and Computer Science |
| 🤖 **AI Interview** | AI-driven mock interview sessions with dialogue, visual, and feedback components |
| 📚 **E-Library** | Curated digital library with downloadable resources |
| 🧪 **Chemistry** | Organic & Inorganic Chemistry modules with interactive visualizations (e.g., Lewis structures, ionic/covalent bonds) |
| 💻 **Computer Science** | Data Structures labs and CS fundamentals |
| ⚡ **Physics** | Circuit design simulations and physics experiments |
| 📊 **Progress Tracking** | Per-module progress saved to Firebase Firestore with email notifications and weekly digests |

---

## 🏗️ Project Structure

```
VIRTUAL LEARNING PLATFORM/
│
├── backend/
│   └── server.js              # Express API server (Firebase Admin, progress API, static serving)
│
├── home/
│   ├── start_2.html           # Landing / sign-in page
│   ├── mainHome.html          # Main dashboard
│   ├── mainHome_2.html        # Updated dashboard (Tailwind UI)
│   ├── firebase-backend.js    # Client-side Firebase config & auth helpers
│   ├── site-auth.js           # Route-level auth guard (injected into every page)
│   ├── progress-tracker.js    # Progress save/read utilities
│   ├── home.js                # Dashboard logic
│   ├── request_lab.html       # Lab request form
│   ├── sort_home.html         # Sorted home view
│   └── ai_interview/
│       ├── ai_index.html      # AI Interview home
│       ├── ai_daigloue.html   # Interview dialogue UI
│       ├── visual_ai.html     # Visual AI interface
│       └── request_inter.html # Interview request form
│
├── chemistry/                 # Chemistry subject module
├── computer_science/          # CS subject module
│   └── cs_data_structures/    # Data Structures labs (lab1–lab18+)
├── library/                   # E-Library content
├── physics/                   # Physics & circuit simulations
│
├── firestore.ai-interviews.rules   # Firestore security rules – AI Interviews DB
├── firestore.e-library.rules       # Firestore security rules – E-Library DB
├── firestore.virtual-labs.rules    # Firestore security rules – Virtual Labs DB
├── firebase.json              # Firebase project config & hosting rules
│
├── package.json               # Node.js dependencies & npm scripts
├── server.mjs                 # Alternative ESM server entry
└── README.md                  # You are here
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Firebase](https://firebase.google.com/) project with Firestore enabled
- Google Application Default Credentials configured (for Firebase Admin SDK)
- A [Resend](https://resend.com/) account (for email notifications — optional)

### Installation

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd "VIRTUAL LEARNING PLATFORM"

# 2. Install dependencies
npm install

# 3. Set environment variables (create a .env file or export in your shell)
#    RESEND_API_KEY=your_resend_api_key
#    RESEND_FROM_EMAIL=noreply@yourdomain.com
#    GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json

# 4. Start the server
npm start
```

The server will start at **http://localhost:5000** and redirect to the landing page.

---

## 🔧 Backend API

The Express server (`backend/server.js`) exposes the following endpoints:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Health check — returns server status |
| `POST` | `/api/progress/notify` | Send a progress email for a completed activity (requires Firebase auth token) |

### Progress Databases (Firestore)

Three separate Firestore databases track progress per module:

| Database ID | Module |
|---|---|
| `virtual-labs` | Virtual Labs progress |
| `ai-interviews` | AI Interview sessions |
| `e-library` | E-Library downloads & reads |

### Weekly Digest

A cron job runs **every Monday at 9:00 AM IST** to email users a summary of their activity from the past 7 days.

---

## 🛡️ Authentication

- Firebase Authentication is used for all user sign-in/sign-up flows.
- `site-auth.js` is automatically injected into every HTML page (except the start/home pages) by the server to enforce login before access.
- API routes verify Firebase ID tokens via `firebase-admin`.

---

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, Tailwind CSS, Vanilla JavaScript |
| **Backend** | Node.js, Express v5 |
| **Database** | Firebase Firestore (multi-database) |
| **Auth** | Firebase Authentication |
| **Email** | Resend API |
| **Scheduling** | node-cron |
| **Icons/Fonts** | Font Awesome, Google Fonts (Inter) |

---

## 📦 Key Dependencies

```json
{
  "express": "^5.3.0",
  "firebase-admin": "^14.5.0",
  "google-auth-library": "^11.3.1",
  "mongoose": "^9.11.4",
  "node-cron": "^4.6.0",
  "node-fetch": "^3.3.2",
  "bcryptjs": "^3.0.3",
  "cors": "^2.8.6",
  "jsonwebtoken": "^9.0.3"
}
```

---

## 🌐 Sections & Modules

### 🔬 Virtual Labs
Interactive simulations for hands-on practice. Labs are organized by subject with scored assessments and progress tracking.

### 🤖 AI Interview
Conversational AI mock interviews. Supports visual AI interactions, dialogue sessions, and interview request submissions.

### 🧪 Chemistry
- **Organic Chemistry** — Reaction mechanisms, molecular structures
- **Inorganic Chemistry** — Ionic/covalent bonds, general reviews
- **Interactive Chemistry** — Visual tools like Lewis Structure builder

### 💻 Computer Science
- **Data Structures** — 18+ interactive lab exercises covering arrays, linked lists, trees, graphs, and more

### ⚡ Physics
- Circuit design simulations and physics experiment modules

### 📚 E-Library
Digital resource library with downloadable content and read-tracking.

---

## 📧 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port (default: `5000`) |
| `RESEND_API_KEY` | Yes (for email) | API key from Resend for sending emails |
| `RESEND_FROM_EMAIL` | Yes (for email) | Sender email address verified with Resend |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | Path to Firebase service account JSON |

---

## 📄 License

ISC License — see `package.json` for details.

