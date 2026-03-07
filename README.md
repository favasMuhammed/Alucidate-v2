<div align="center">
  <h1 align="center">AIucidate</h1>
  <p align="center">
    <strong>An AI-powered academic tutor and interactive syllabus manager.</strong>
  </p>
</div>

---

## 📖 Overview

**AIucidate** is an intelligent, offline-capable academic study assistant designed to transform static PDF textbook chapters into interactive learning modules. The application provides students with AI-generated summaries, keyword definitions, and hierarchical mind maps for every chapter.

The application features role-based workflows:
- **Administrators**: Upload and manage subject syllabuses by uploading PDF chapters. The app automatically analyzes the PDFs and generates interactive, structured study content.
- **Students**: Access their class materials, explore interactive mind maps, and chat with a context-aware AI tutor that answers questions accurately based *only* on the provided textbook material.

## ✨ Features

- **Interactive AI Academic Tutor**: Ask questions via chat or directly from the mind map. The AI responds with highly contextual answers, including KaTeX formatted mathematical equations and explicit file/page citations.
- **Automated Study Material Generation**: Upload a chapter PDF and automatically receive a concise chapter summary and 5-10 essential keywords with definitions.
- **Hierarchical Concept Mind Maps**: Visually explore chapter contents through AI-generated structural mind maps, breaking down complex topics into digestible nodes.
- **Offline-First Storage**: Utilizes IndexedDB (`SyllabusDB`) to locally store User data, Subject structures, Base64 Encoded PDFs, and AI-generated metadata, reducing the need for constant network calls.
- **Role-based Authentication**: Simple, seamless signup and login flows with localized tracking for dynamic Admin or Student dashboards.

## 🛠️ Technology Stack

- **Frontend**: React (v19), TypeScript, Vite
- **Styling**: Tailwind CSS
- **AI Integration**: AI SDK Integrations
- **PDF Processing**: `pdfjs-dist` (v4.4.168)
- **Local Storage**: IndexedDB (wrapper via custom `dbService`)

## 🚀 Getting Started

### Prerequisites

- Node.js installed on your machine.
- A valid API Key for the AI service.

### Installation & Setup

1. **Clone the repository** (if you haven't already) and navigate to the project directory:
   ```bash
   cd Alucidate
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the root directory and add your API Key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   The application will start, typically accessible at `http://localhost:3000/`.

---

## 👨‍💻 Team & Contributors

This project was built and conceptualized by:

<div style="display: flex; justify-content: start; gap: 15px; margin-top: 10px;">
  
  <a href="https://www.linkedin.com/in/mroshan1?trk=profile-badge">
    <img src="https://img.shields.io/badge/Roshan_M-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Roshan M LinkedIn" />
  </a>

  <a href="https://ae.linkedin.com/in/muhammed-favas-t-p?trk=profile-badge">
    <img src="https://img.shields.io/badge/Muhammed_Favas_T_P-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Muhammed Favas T P LinkedIn" />
  </a>
</div>

---

<div align="center">
  <p>Built with ❤️ by <a href="https://nayrix.com" target="_blank">Nayrix</a> utilizing React.</p>
</div>

