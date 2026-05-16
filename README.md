# Meeting Lens

A complete full-stack application for processing video files, extracting audio, transcribing with state-of-the-art ASR models (Whisper), and summarizing transcripts using any LLM (ChatGPT, Claude, LM Studio, etc.) based on a dynamic JSON template.

## Features
- **GPU-Accelerated Transcriptions**: Uses `faster-whisper` for extremely fast ASR inference. Supports toggling between CPU and GPU dynamically.
- **Multiple LLM Providers**: Supports OpenAI, Anthropic (Claude), LM Studio, and any OpenAI compatible endpoints.
- **Dynamic Summarization**: Inject your own JSON structure to customize how the transcript gets processed.
- **Beautiful UI**: Modern glassmorphic interface with reactive feedback.

## Requirements
- Python 3.9+
- Node.js 18+
- [FFmpeg](https://ffmpeg.org/download.html)
- [NVIDIA GPU](https://developer.nvidia.com/cuda-downloads)
- [CUDA toolkit and cuDNN](https://developer.nvidia.com/cuda-downloads)

## Setup Instructions

### 1. Backend Setup
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Create a virtual environment (recommended):
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
3. Install the required Python packages:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```
The backend API will run on `http://localhost:8000`.

### 2. Frontend Setup
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install Node.js dependencies (already done if you see `node_modules`):
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
The frontend UI will be available at `http://localhost:5173`.

### ASR Models
The application will automatically download the Whisper models on the first run. The available models are:
- `tiny` (Fastest, ~39MB)
- `base` (Good baseline, ~74MB)
- `small` (~241MB)
- `medium` (~769MB)
- `large-v3` (Highest accuracy, ~1.5GB)

> **Note on GPUs:** If you have an NVIDIA GPU, make sure you have the CUDA toolkit and cuDNN installed to leverage GPU acceleration for `faster-whisper`.
