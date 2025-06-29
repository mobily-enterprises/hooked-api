#!/bin/bash

# Script to serve documentation and open browser

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to open browser
open_browser() {
    local url="$1"
    
    # Wait a bit for server to start
    sleep 2
    
    echo -e "${BLUE}Opening browser at ${url}...${NC}"
    
    # Try different methods to open browser in new window
    if command -v xdg-open >/dev/null 2>&1; then
        # Linux - try to open in new window
        # First try with common browsers that support --new-window
        if command -v google-chrome >/dev/null 2>&1; then
            google-chrome --new-window "$url" 2>/dev/null &
        elif command -v chromium >/dev/null 2>&1; then
            chromium --new-window "$url" 2>/dev/null &
        elif command -v firefox >/dev/null 2>&1; then
            firefox --new-window "$url" 2>/dev/null &
        else
            # Fallback to xdg-open (will use default browser but may not open new window)
            xdg-open "$url" 2>/dev/null &
        fi
    elif command -v open >/dev/null 2>&1; then
        # macOS - opens in new window by default
        open "$url" 2>/dev/null &
    elif command -v start >/dev/null 2>&1; then
        # Windows (Git Bash/WSL) - opens in new window by default
        start "$url" 2>/dev/null &
    else
        echo -e "${YELLOW}Could not detect browser command. Please open manually: ${url}${NC}"
    fi
}

# Start Jekyll server in background and capture output
echo -e "${BLUE}Starting Jekyll server...${NC}"

# Open browser in background after server starts
open_browser "http://127.0.0.1:4000" &

# Start Jekyll server (this will run in foreground)
cd docs && bundle exec jekyll serve