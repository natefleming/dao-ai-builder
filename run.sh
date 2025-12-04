#!/bin/bash
# Run both backend and frontend servers for development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting DAO AI Builder...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Creating from .env.example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${YELLOW}Please edit .env with your Databricks credentials.${NC}"
    else
        echo -e "${RED}Error: .env.example not found. Please create a .env file.${NC}"
        exit 1
    fi
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo -e "${GREEN}Starting backend server on port 8000...${NC}"
cd backend
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 2

# Start frontend
echo -e "${GREEN}Starting frontend server on port 3000...${NC}"
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo -e "\n${GREEN}Servers started!${NC}"
echo -e "  Frontend: ${YELLOW}http://localhost:3000${NC}"
echo -e "  Backend:  ${YELLOW}http://localhost:8000${NC}"
echo -e "  API Docs: ${YELLOW}http://localhost:8000/docs${NC}"
echo -e "\nPress Ctrl+C to stop both servers.\n"

# Wait for both processes
wait

