#!/bin/bash

# Create a virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt

# Install PyTorch with CUDA support (if available) or CPU-only
if command -v nvidia-smi &> /dev/null; then
    echo "CUDA is available, installing PyTorch with CUDA support"
    pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
else
    echo "CUDA not available, installing CPU-only PyTorch"
    pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

echo "Python environment setup complete. Activate with: source venv/bin/activate"
