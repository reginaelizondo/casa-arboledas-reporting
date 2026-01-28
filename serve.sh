#!/bin/bash
# Simple local server for testing
# Run this script from the project directory, then open http://localhost:8080
echo "Starting local server at http://localhost:8080"
echo "Press Ctrl+C to stop"
cd "$(dirname "$0")"
python3 -m http.server 8080
