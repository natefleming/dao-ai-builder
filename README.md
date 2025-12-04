# DAO AI Agent Builder

A modern, React-based configuration studio for building dao-ai agent systems. Features a split-panel interface with live YAML preview, dark theme, and native Databricks integration.

## Features

### 🎨 Modern Dark UI
- Sophisticated dark theme with slate color palette
- Glass morphism effects and smooth animations
- Responsive split-panel layout
- Real-time YAML preview with syntax highlighting

### 🔗 Databricks Integration

Authentication is resolved in this order:

1. **X-Forwarded-Access-Token header** - Databricks App with on-behalf-of user auth
2. **DATABRICKS_TOKEN env var** - Fallback for service auth or local dev
3. **Manual configuration** - User enters credentials in UI

Host is resolved:
1. **window.location.origin** - When running in Databricks App
2. **DATABRICKS_HOST env var** - For local development
3. **Manual configuration** - User enters in UI

### 📦 Auto-Discovery of Databricks Assets
- Unity Catalog catalogs, schemas, tables, functions, volumes
- Model serving endpoints
- SQL warehouses
- Genie spaces
- Vector search endpoints and indexes
- Registered models

### 📦 Complete Configuration Support
- **Schemas**: Unity Catalog schema definitions
- **LLMs**: Language model configuration with common presets
- **Tools**: Factory, Python, Unity Catalog, and MCP tools
- **Guardrails**: Safety checks with customizable prompts
- **Agents**: Full agent configuration with tools and guardrails
- **Orchestration**: Supervisor and Swarm patterns
- **App Config**: Deployment settings and model registration

### 🔄 Import/Export
- Import existing YAML configurations
- Export to dao-ai compatible YAML
- Copy configuration to clipboard
- Real-time preview updates

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+

### Local Development

1. Create a `.env` file in the project root:

```bash
# .env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi...
```

2. Install and run:

```bash
# Install dependencies and build frontend
cd frontend
npm install
npm run build
cd ..

# Copy frontend build to static folder
cp -r frontend/dist static

# Install Python dependencies
pip install -r requirements.txt

# Run the app
python app.py
```

Open [http://localhost:8080](http://localhost:8080)

## Deploy to Databricks Apps

### Option 1: Using Databricks Asset Bundles (Recommended)

This is the cleanest deployment method using Databricks Asset Bundles:

```bash
# 1. Build the frontend first
cd frontend && npm install && npm run build && cd ..
cp -r frontend/dist static

# 2. Deploy using bundles
databricks bundle deploy -t dev
```

### Option 2: Using the Deploy Script

```bash
./deploy.sh dao-ai-builder
```

This script will:
1. Build the frontend
2. Upload source code to your workspace
3. Create/update the Databricks App

You can specify a custom workspace path:
```bash
./deploy.sh dao-ai-builder /Workspace/Users/your.email@company.com/apps/dao-ai-builder
```

### Option 3: Manual Deployment

1. **Build the frontend:**

```bash
cd frontend
npm install
npm run build
cd ..
rm -rf static
cp -r frontend/dist static
```

2. **Upload to workspace:**

```bash
# Create workspace directory
databricks workspace mkdirs /Workspace/Users/YOUR_EMAIL/apps/dao-ai-builder

# Upload files (use databricks sync for easier bulk upload)
databricks sync . /Workspace/Users/YOUR_EMAIL/apps/dao-ai-builder --watch=false
```

3. **Deploy the app:**

```bash
# Create new app
databricks apps create dao-ai-builder \
  --source-code-path /Workspace/Users/YOUR_EMAIL/apps/dao-ai-builder

# Or update existing app
databricks apps deploy dao-ai-builder \
  --source-code-path /Workspace/Users/YOUR_EMAIL/apps/dao-ai-builder
```

### Deployment Files

The following files are required for Databricks Apps deployment:

| File | Description |
|------|-------------|
| `app.yaml` | Databricks App configuration (command, env vars) |
| `app.py` | Flask application entry point |
| `requirements.txt` | Python dependencies |
| `static/` | Built frontend files |

### Authentication in Databricks Apps

When deployed as a Databricks App, authentication works automatically:

1. **On-Behalf-Of User Auth (Recommended)**: Enable user authorization in your Databricks App settings. The user's token is automatically forwarded via `X-Forwarded-Access-Token` header.

2. **Service Principal**: Set `DATABRICKS_TOKEN` environment variable in your app configuration.

Reference: [Databricks Apps Cookbook](https://apps-cookbook.dev/docs/streamlit/authentication/users_obo)

## Project Structure

```
dao-ai-ui/
├── app.yaml              # Databricks App configuration
├── app.py                # Flask app entry point
├── requirements.txt      # Python dependencies
├── deploy.sh             # Deployment script
├── static/               # Built frontend (generated)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/   # Header, Sidebar, ConfigPanel, PreviewPanel
│   │   │   ├── sections/ # Schemas, LLMs, Tools, Agents, etc.
│   │   │   └── ui/       # Button, Input, Select, Modal, etc.
│   │   ├── hooks/
│   │   │   └── useDatabricks.ts
│   │   ├── services/
│   │   │   └── databricksNativeApi.ts
│   │   ├── stores/
│   │   │   └── configStore.ts
│   │   └── types/
│   │       └── dao-ai-types.ts
│   ├── package.json
│   └── vite.config.ts
├── backend/              # Legacy backend (use app.py instead)
└── docs/
```

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                         Browser                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  React App                                                      │
│      │                                                          │
│      │ /api/auth/token ──► Get token from headers/env           │
│      │ /api/databricks/* ──► Proxy to Databricks APIs           │
│      ▼                                                          │
│  Flask Backend (app.py)                                         │
│  - Serves static frontend                                       │
│  - Proxies Databricks API calls                                 │
│  - Extracts X-Forwarded-Access-Token                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

The Flask backend:
1. Serves the static React frontend
2. Provides `/api/auth/token` to pass auth context to frontend
3. Proxies `/api/databricks/*` requests to Databricks APIs (avoids CORS)

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Zustand (state management)
- Tailwind CSS
- Lucide React (icons)
- js-yaml

### Backend
- Flask
- Gunicorn (production)
- Requests (for API proxy)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABRICKS_HOST` | Databricks workspace URL | For local dev |
| `DATABRICKS_TOKEN` | Databricks access token | For local dev |
| `PORT` | Server port (default: 8080) | No |
| `DEBUG` | Enable debug mode | No |
| `STATIC_FOLDER` | Path to static files | No |

## License

MIT
