# DAO AI Builder

> Build AI agents visually — no YAML required

![DAO AI Builder Screenshot](docs/images/dao-ai-builder-screenshot.png)

**DAO AI Builder** is a visual interface for creating AI agent configurations. Instead of writing YAML by hand, you use forms and dropdowns to configure agents, connect to your data, and export ready-to-deploy configurations.

This is the **companion tool** for [DAO AI](https://github.com/databricks/dao-ai), Databricks' framework for building and deploying AI agents.

---

## Quick Start

### Prerequisites

Before you begin, you'll need:

- **Databricks workspace access** with Unity Catalog enabled
- **Databricks CLI** installed and authenticated
- **Node.js** (version 18 or higher)
- **npm** (comes with Node.js)

To check if you're ready:

```bash
databricks --version     # Should show a version number
databricks current-user me   # Should show your Databricks username
node --version           # Should show v18.x.x or higher
npm --version            # Should show a version number
```

### Deploy to Databricks

The easiest way to use DAO AI Builder is to deploy it as a Databricks App:

```bash
# Clone the repository
git clone https://github.com/natefleming/dao-ai-builder.git
cd dao-ai-builder

# Deploy (builds frontend, syncs files, starts the app)
./deploy.sh
```

That's it! The script will:
1. Build the frontend
2. Upload files to your Databricks workspace
3. Create and start the app
4. Display the URL when ready

**First deployment takes 3-5 minutes.** Subsequent deployments are faster.

### Access Your App

After deployment, the script displays your app URL:

```
App URL: https://your-workspace.cloud.databricks.com/apps/dao-ai-builder
```

Click the link or copy it to your browser. You'll be automatically authenticated with your Databricks account.

---

## What You Can Do

With DAO AI Builder, you can:

- **Configure agents** with models, tools, and prompts
- **Connect to data sources** like Genie, SQL warehouses, and Vector Search
- **Browse Databricks resources** directly from the UI
- **Preview your configuration** as YAML in real-time
- **Export configurations** for use with [DAO AI](https://github.com/databricks/dao-ai)
- **Import existing configs** to edit them visually
- **Get AI assistance** for writing prompts

---

## How It Relates to DAO AI

**DAO AI Builder** creates configuration files. **[DAO AI](https://github.com/databricks/dao-ai)** deploys them.

```
DAO AI Builder (this tool)        DAO AI Framework
┌────────────────────┐           ┌────────────────────┐
│  Visual interface  │           │  Deployment engine │
│  Point and click   │ ───────►  │  Provisions agents │
│  Export YAML       │  config   │  Runs on Databricks│
└────────────────────┘   file    └────────────────────┘
```

**Workflow:**
1. Design your agent in DAO AI Builder
2. Export the YAML configuration
3. Deploy with DAO AI: `dao deploy my-agent.yaml`

**Learn more:** [github.com/databricks/dao-ai](https://github.com/databricks/dao-ai)

---

## Deployment Options

### Option 1: Deploy Script (Recommended)

```bash
./deploy.sh
```

Use `--force` for a clean deployment:

```bash
./deploy.sh --force
```

### Option 2: Manual Deployment

If you prefer to run the steps yourself:

```bash
# Build frontend
cd frontend
npm install
npm run build
cd ..

# Copy to static folder
rm -rf static
cp -r frontend/dist static

# Deploy using Databricks bundle
databricks bundle deploy

# Deploy the app
databricks apps deploy dao-ai-builder --source-code-path <your-workspace-path>
```

---

## Redeploying

After making changes, redeploy with:

```bash
./deploy.sh
```

To see the app status:

```bash
databricks apps get dao-ai-builder
```

To stop the app:

```bash
databricks apps stop dao-ai-builder
```

---

## Troubleshooting

### "Databricks CLI not found"

Install the Databricks CLI:

```bash
pip install databricks-cli
databricks configure
```

### "Databricks CLI not authenticated"

Run:

```bash
databricks configure
```

Or use OAuth:

```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

### "npm not found"

Install Node.js from https://nodejs.org (choose the LTS version).

### Deployment times out

The app may still be starting. Check status:

```bash
databricks apps get dao-ai-builder
```

Wait a minute and try accessing the URL again.

### Need a clean deployment

Remove cached files and redeploy:

```bash
./deploy.sh --force
```

### App shows old version

1. Redeploy: `./deploy.sh`
2. Hard refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)

---

## Configuration Sections

| Section | Purpose |
|---------|---------|
| **Variables** | Reusable values (API keys, settings) |
| **Schemas** | Unity Catalog locations for your data |
| **Resources** | Data sources (Genie, SQL, Vector Search) |
| **Tools** | Actions agents can perform |
| **Guardrails** | Safety checks for responses |
| **Memory** | Conversation storage |
| **Agents** | AI agents with models and prompts |
| **Application** | Deployment settings |

---

## Useful Commands

```bash
# Deploy or redeploy
./deploy.sh

# Clean deployment (removes cached files)
./deploy.sh --force

# Check app status
databricks apps get dao-ai-builder

# View deployment history
databricks apps list-deployments dao-ai-builder

# Stop the app
databricks apps stop dao-ai-builder

# Start the app
databricks apps start dao-ai-builder
```

---

## Related Links

- **DAO AI Framework:** [github.com/databricks/dao-ai](https://github.com/databricks/dao-ai)
- **DAO AI Documentation:** [docs](https://github.com/databricks/dao-ai/tree/main/docs)
- **Example Configurations:** [examples](https://github.com/databricks/dao-ai/tree/main/config/examples)
- **Databricks Apps:** [docs.databricks.com](https://docs.databricks.com/dev-tools/databricks-apps/)

---

## License

MIT

---

<p align="center">
  Part of the <a href="https://github.com/databricks/dao-ai">DAO AI</a> ecosystem
</p>
