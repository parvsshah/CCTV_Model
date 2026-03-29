---
title: YOLO Crowd Analysis
emoji: 🎥
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
app_port: 7860
---

# YOLO-CROWD Backend

This is the backend for the YOLO-CROWD analysis tool, migrated to Hugging Face Spaces to utilize 16GB RAM for high-resource video processing.

## Deployment Instructions

1. Create a new **Space** on Hugging Face.
2. Select **Docker** as the SDK.
3. Upload the files from this repository (or connect your GitHub).
4. Ensure the `Dockerfile` used is the one provided here.
5. Set your `MONGODB_URI` and any other secrets in the Space's **Settings > Variables and secrets**.
