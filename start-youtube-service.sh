#!/bin/bash

echo "🎬 Starting YouTube Transcript Service"
echo "======================================"

cd projects/yt-transcript-service

if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🚀 Starting service on http://localhost:3002"
echo ""
echo "💡 Leave this running while using Doodle Reader"
echo "🔗 Test: curl 'http://localhost:3002/transcript?v=dQw4w9WgXcQ'"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm start