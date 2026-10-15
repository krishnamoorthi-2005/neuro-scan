import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

if __name__ == "__main__":
    import uvicorn
    print("=" * 66)
    print(" [+] STARTING NEUROSCAN BACKEND SERVER (http://127.0.0.1:8000)")
    print("=" * 66)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False, log_level="info")
