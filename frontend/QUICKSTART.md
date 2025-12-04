# Quick Start Guide

## First Time Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Start the development server:**
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## Using the Wizard

### Step 1: Resources
- Add at least one **Schema** (e.g., `retail_schema` with catalog `retail_consumer_goods` and schema `hardware_store`)
- Add at least one **LLM** (e.g., `default_llm` with model name `databricks-claude-3-7-sonnet`)

### Step 2: Tools
- Add tools that your agents will use
- Most common: Factory tools (e.g., `dao_ai.tools.create_genie_tool`)

### Step 3: Prompts (Optional)
- Create reusable prompt templates
- Can be stored in Unity Catalog

### Step 4: Guardrails (Optional)
- Configure safety checks for agent responses
- Requires an LLM to act as a judge

### Step 5: Agents
- Create agents with:
  - A name and description
  - A model (select from configured LLMs)
  - A system prompt
  - Optional handoff prompt
  - Tools (select from configured tools)
  - Guardrails (select from configured guardrails)

### Step 6: App Config
- Set application name
- Configure log level
- Set endpoint name
- Configure registered model

### Step 7: Review
- Review your configuration
- Download as YAML file

## Tips

- You can navigate between steps using the progress bar at the top
- Completed steps are marked with a green checkmark
- Click on agents in Step 5 to expand and edit them
- Use the "View Config" button in the header to see a pretty preview anytime
- The preview includes syntax highlighting and copy/download buttons

## Troubleshooting

### Port 3000 already in use
Change the port in `vite.config.ts`:
```typescript
server: {
  port: 3001, // or any available port
}
```

### Syntax highlighter not working
If you see errors related to syntax highlighting, you can temporarily disable it by commenting out the SyntaxHighlighter component in `ConfigPreview.tsx` and using a simple `<pre>` tag instead.

