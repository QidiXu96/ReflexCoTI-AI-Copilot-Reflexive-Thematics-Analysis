# ReflexCoTI: AI Copilot for Reflexive Thematic Analysis

ReflexCoTI is a web-based AI copilot designed to support reflexive thematic analysis (RTA). Researchers can conduct manual thematic analysis or review and refine AI-generated suggestions for coding and theme development.
<img width="1096" height="640" alt="NAACL study overview drawio (3)" src="https://github.com/user-attachments/assets/1f94cd2e-6a78-4146-bf8b-507d67219488" />

## Run Locally with Python

### 1. Requirements

- Python 3.1
- Git
- Internet connection for installing dependencies
- Azure OpenAI access

### 2. Clone the repository

```bash
git clone https://github.com/QidiXu96/ReflexCoTI-AI-Copilot-Reflexive-Thematics-Analysis.git
cd ReflexCoTI-AI-Copilot-Reflexive-Thematics-Analysis
```

### 3. Set up the Python environment

```bash
python3.12 -m venv .venv
source .venv/bin/activate
```

### 4. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m nltk.downloader punkt punkt_tab
```

### 5. Launch ReflexCoTI

```bash
PORT=5174 HOST=127.0.0.1 ./start_reflexcoti.sh
```
Open the application in your browser:

**http://127.0.0.1:5174**

Keep the terminal running while using the application. Press `Ctrl+C` to stop the server.

### 6. Configure AI-assisted analysis

To use AI-assisted coding and theme generation, enter your Azure OpenAI credentials in the application:

- Azure OpenAI endpoint
- API key
- API version
- Model deployment name

## Local Data and Privacy

ReflexCoTI stores local projects, uploaded transcripts, and analysis results in the `server_data/` directory, which is excluded from GitHub through `.gitignore`.

Do not upload API keys, confidential transcripts, or protected health information to public repositories.


This project is released under the MIT License. See [LICENSE](LICENSE).
