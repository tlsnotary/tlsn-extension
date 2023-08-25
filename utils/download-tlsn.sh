#!/bin/bash

# Set the directory path where you want to clone the repository
target_directory="tlsn"

# GitHub repository URL
github_url="https://github.com/tlsnotary/tlsn.git"

# Check if the target directory exists
if [ -d "$target_directory" ]; then
    echo "tlsn already exists."
else
    # Clone the repository if the directory doesn't exist
    git clone "$github_url" "$target_directory"
    
    # Check if the cloning was successful
    if [ $? -eq 0 ]; then
        echo "tlsn cloned successfully."
    else
        echo "Error cloning repository."
    fi
fi