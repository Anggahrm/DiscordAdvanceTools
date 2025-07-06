#!/usr/bin/env python3
"""
Discord Tools Pro - Modern Web Interface
Entry point for the Discord Server Cloner & Auto-Poster application.
"""

import os
import sys

# Add the src directory to Python path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def main():
    """Main entry point for the application."""
    try:
        # Import and run the integrated main application
        from integrated_main import main as app_main
        app_main()
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("📦 Installing required dependencies...")
        
        # Try to install requirements
        import subprocess
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
            print("✅ Dependencies installed successfully. Please restart the application.")
        except subprocess.CalledProcessError:
            print("❌ Failed to install dependencies automatically.")
            print("Please run: pip install -r requirements.txt")
        except FileNotFoundError:
            print("❌ requirements.txt not found.")
            print("Please ensure all required packages are installed:")
            print("  - discord.py")
            print("  - flask")
            print("  - requests")
        
        sys.exit(1)
    except Exception as e:
        print(f"❌ An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
