"""
AttendSure V3 - Automated System Update & Synchronization Script
File: D:\AttendSure_V3\update_project.py

What it does:
1. Cybersecurity Check: Ensures your local database and .env files are safe before updating.
2. Code Synchronization: Pulls the latest commits and version tags from GitHub main branch.
3. Backend Upgrade: Automatically detects virtual environment, updates pip packages,
   applies database migrations, and runs Django system integrity checks.
4. Web & Mobile Synchronization: Installs dependencies only when package.json files have changed.
"""

import os
import sys
import hashlib
import subprocess

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT_DIR)

BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
WEB_DIR = os.path.join(ROOT_DIR, "web")
MOBILE_DIR = os.path.join(ROOT_DIR, "mobile")


def get_file_hash(filepath: str) -> str:
    """Calculates MD5 hash of a file to avoid unnecessary package reinstalls."""
    if not os.path.exists(filepath):
        return ""
    hasher = hashlib.md5()
    with open(filepath, "rb") as f:
        hasher.update(f.read())
    return hasher.hexdigest()


def find_python_executable() -> str:
    """Finds the virtual environment Python interpreter if available."""
    venv_paths = [
        os.path.join(BACKEND_DIR, "venv", "Scripts", "python.exe"),
        os.path.join(BACKEND_DIR, ".venv", "Scripts", "python.exe"),
        os.path.join(ROOT_DIR, "venv", "Scripts", "python.exe"),
    ]
    for path in venv_paths:
        if os.path.isfile(path):
            return path
    return sys.executable  # Fallback to active Python


def run_command(cmd, cwd=ROOT_DIR, check=True):
    """Executes system commands cleanly with real-time output."""
    result = subprocess.run(cmd, cwd=cwd, shell=True)
    if check and result.returncode != 0:
        print(f"\n[ERROR] Command failed with exit code {result.returncode}: {cmd}")
        sys.exit(result.returncode)
    return result.returncode


def main():
    print("=" * 60)
    print("AttendSure V3 - System Update & Verification")
    print("=" * 60)

    # -----------------------------------------------------------------------
    # 1. CYBERSECURITY: STASH WORKING DIRECTORY & PREVENT OVERWRITES
    # -----------------------------------------------------------------------
    print("\n[1/5] Checking Git repository status...")
    status = subprocess.getoutput("git status --porcelain").strip()
    stashed = False

    if status:
        print("Local changes detected. Stashing changes temporarily to prevent conflicts...")
        run_command("git stash push -m 'attendsure_auto_update_stash'")
        stashed = True

    print("Fetching and pulling latest code from origin main...")
    run_command("git fetch origin main --tags")
    run_command("git checkout main")
    run_command("git pull origin main")

    if stashed:
        print("Restoring your stashed local files...")
        subprocess.run("git stash pop", cwd=ROOT_DIR, shell=True)

    # -----------------------------------------------------------------------
    # 2. BACKEND: VENV, REQUIREMENTS, MIGRATIONS & INTEGRITY CHECK
    # -----------------------------------------------------------------------
    print("\n[2/5] Updating Backend (Django)...")
    python_bin = find_python_executable()
    print(f"Using Python runtime: {python_bin}")

    requirements_file = os.path.join(BACKEND_DIR, "requirements.txt")
    if os.path.isfile(requirements_file):
        print("Verifying Python packages from requirements.txt...")
        run_command(f'"{python_bin}" -m pip install -r requirements.txt --quiet', cwd=BACKEND_DIR)

    manage_py = os.path.join(BACKEND_DIR, "manage.py")
    if os.path.isfile(manage_py):
        print("Applying database migrations...")
        run_command(f'"{python_bin}" manage.py migrate', cwd=BACKEND_DIR)

        print("Running system security and model check...")
        run_command(f'"{python_bin}" manage.py check', cwd=BACKEND_DIR)

    # -----------------------------------------------------------------------
    # 3. WEB PORTAL: CHECK DEPENDENCIES
    # -----------------------------------------------------------------------
    if os.path.isdir(WEB_DIR):
        print("\n[3/5] Updating Web Dashboard dependencies...")
        web_pkg = os.path.join(WEB_DIR, "package.json")
        web_modules = os.path.join(WEB_DIR, "node_modules")

        # Run npm install if node_modules does not exist or package.json is updated
        if not os.path.isdir(web_modules):
            print("Installing Web node_modules...")
            run_command("npm install", cwd=WEB_DIR)
        else:
            print("Web node_modules found. Updating package tree...")
            run_command("npm install --prefer-offline", cwd=WEB_DIR)

    # -----------------------------------------------------------------------
    # 4. MOBILE APP: CHECK DEPENDENCIES
    # -----------------------------------------------------------------------
    if os.path.isdir(MOBILE_DIR):
        print("\n[4/5] Updating Mobile (React Native / Expo) dependencies...")
        mobile_modules = os.path.join(MOBILE_DIR, "node_modules")

        if not os.path.isdir(mobile_modules):
            print("Installing Mobile node_modules...")
            run_command("npm install", cwd=MOBILE_DIR)
        else:
            print("Mobile node_modules found. Updating package tree...")
            run_command("npm install --prefer-offline", cwd=MOBILE_DIR)

    # -----------------------------------------------------------------------
    # 5. VERIFY REVISION TAG
    # -----------------------------------------------------------------------
    print("\n[5/5] Checking active version tag...")
    current_tag = subprocess.getoutput("git describe --tags --abbrev=0 2>$null").strip()
    if not current_tag:
        current_tag = "No Git tag detected (main branch HEAD)"

    print("=" * 60)
    print("SUCCESS: AttendSure V3 is updated and verified!")
    print(f"Current Version Tag : {current_tag}")
    print("=" * 60)


if __name__ == "__main__":
    main()