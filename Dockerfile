# Use an official Node.js and Python combined image
FROM nikolaik/python-nodejs:python3.10-nodejs20-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for OpenCV
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install wget
RUN apt-get update && apt-get install -y wget

# Download model from GitHub Releases
RUN wget -L https://github.com/parvsshah/CCTV_Model/releases/download/v1.0.0/yolo-crowd.pt -O /app/yolo-crowd.pt

# Copy the entire project
COPY . .

# Set working directory to frontend to install Node.js dependencies
WORKDIR /app/frontend

# Install Node.js dependencies
RUN npm install

# Build the Express API server
RUN npm run build:server

# Expose the API port
EXPOSE 8080

# Start the Express API server (Render automatically sets PORT)
CMD ["npm", "start"]
