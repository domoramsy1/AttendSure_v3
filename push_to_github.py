"""
AttendSure V3 - Safe GitHub Deployment Script with Dynamic Tag Calculation
File: D:\AttendSure_V3\push_to_github.py
"""

import os
import sys
import subprocess
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT_DIR)

# ---------------------------------------------------------------------------
# 1. CYBERSECURITY: ENFORCE STRICT .GITIGNORE
# ---------------------------------------------------------------------------
GITIGNORE_PATH = os.path.join(ROOT_DIR, ".gitignore")

REQUIRED_IGNORES = [
    ".env",
    ".env.*",
    "*.env",
    "**/.env",
    "backend/.env",
    "mobile/.env",
    "web/.env",
    "db.sqlite3",
    "*.sqlite3",
    "*.db",
    "all_source_codes.txt",
    "project_files.txt",
    "*.keystore",
    "*.jks",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "google-services.json",
    "GoogleService-Info.plist",
    "node_modules/",
    "__pycache__/",
    "*.pyc",
    "venv/",
    "env/",
    ".venv/",
    "dist/",
    "build/",
    ".expo/",
    ".vscode/",
    "*.log",
]

print("Verifying .gitignore security rules...")

existing_rules = set()
if os.path.exists(GITIGNORE_PATH):
    with open(GITIGNORE_PATH, "r", encoding="utf-8") as f:
        existing_rules = {line.strip() for line in f if line.strip()}

missing_rules = [r for r in REQUIRED_IGNORES if r not in existing_rules]

if not os.path.exists(GITIGNORE_PATH):
    with open(GITIGNORE_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(REQUIRED_IGNORES) + "\n")
    print("Created .gitignore with full security rules.")
elif missing_rules:
    with open(GITIGNORE_PATH, "a", encoding="utf-8") as f:
        f.write("\n" + "\n".join(missing_rules) + "\n")
    print(f"Added {len(missing_rules)} missing protection rule(s) to .gitignore.")

# ---------------------------------------------------------------------------
# 2. GIT INITIALIZATION & CACHE PURGE
# ---------------------------------------------------------------------------
try:
    subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except subprocess.CalledProcessError:
    print("Initializing new Git repository...")
    subprocess.run(["git", "init"], check=True)
    subprocess.run(["git", "branch", "-M", "main"], check=True)

# Ensure author identity
user_name = subprocess.getoutput("git config user.name").strip()
user_email = subprocess.getoutput("git config user.email").strip()
if not user_name:
    subprocess.run(["git", "config", "user.name", "Ramsy Domo"])
if not user_email:
    subprocess.run(["git", "config", "user.email", "ramsy.domo@attendsure.local"])

# Untrack accidentally indexed sensitive files
sensitive_patterns = [
    ".env",
    "*.env",
    "backend/.env",
    "mobile/.env",
    "web/.env",
    "db.sqlite3",
    "*.sqlite3",
    "all_source_codes.txt",
    "project_files.txt",
    "*.keystore",
    "*.jks",
]

for pat in sensitive_patterns:
    subprocess.run(["git", "rm", "--cached", "-r", "-q", "--ignore-unmatch", pat], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ---------------------------------------------------------------------------
# 3. REMOTE REPOSITORY CONFIGURATION
# ---------------------------------------------------------------------------
default_repo_url = "https://github.com/domoramsy1/AttendSure_v3.git"
remotes = subprocess.getoutput("git remote").split()

if not remotes:
    print("\nNo GitHub remote configured.")
    input_url = input(f"Enter GitHub Repo URL (Press Enter for '{default_repo_url}'): ").strip()
    repo_url = input_url if input_url else default_repo_url
    subprocess.run(["git", "remote", "add", "origin", repo_url], check=True)
    print(f"Connected remote origin: {repo_url}")
else:
    current_origin = subprocess.getoutput("git remote get-url origin").strip()
    print(f"Target remote: {current_origin}")

# ---------------------------------------------------------------------------
# 4. DYNAMIC SEMANTIC VERSION CALCULATION
# ---------------------------------------------------------------------------
print("\nFetching existing tags from GitHub...")
subprocess.run(["git", "fetch", "--tags", "-q", "origin"], stderr=subprocess.DEVNULL)

raw_tags = subprocess.getoutput("git tag -l").splitlines()
parsed_tags = []

for tag_name in raw_tags:
    clean = tag_name.strip().lstrip("vV")
    parts = clean.split(".")
    if len(parts) >= 2 and all(p.isdigit() for p in parts):
        parsed_tags.append(([int(p) for p in parts], tag_name.strip()))

if parsed_tags:
    # Sort numerically so v3.0.12 is ranked higher than v3.0.9
    parsed_tags.sort(key=lambda item: item[0])
    highest_parts, latest_tag = parsed_tags[-1]
    
    # Increment the last revision number
    highest_parts[-1] += 1
    suggested_tag = "v" + ".".join(str(p) for p in highest_parts)
    print(f"Latest Tag Found: {latest_tag}")
    print(f"Calculated Next Tag: {suggested_tag}")
else:
    suggested_tag = "v3.0.13"
    print(f"No existing tags found. Starting at: {suggested_tag}")

tag_input = input(f"\nRelease Tag (Press Enter to use '{suggested_tag}'): ").strip()
final_tag = tag_input if tag_input else suggested_tag

# ---------------------------------------------------------------------------
# 5. COMMIT MESSAGE & BRANCH RESOLUTION
# ---------------------------------------------------------------------------
branch = subprocess.getoutput("git branch --show-current").strip()
if not branch:
    branch = "main"
    subprocess.run(["git", "branch", "-M", "main"])

now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
default_message = f"Release {final_tag} - {now_str}"
input_msg = input(f"\nEnter commit message (Press Enter for '{default_message}'): ").strip()
commit_msg = input_msg if input_msg else default_message

# ---------------------------------------------------------------------------
# 6. STAGE, AUDIT, COMMIT, TAG & PUSH
# ---------------------------------------------------------------------------
print("\nStaging files...")
subprocess.run(["git", "add", "."], check=True)

# Pre-commit security check
staged_output = subprocess.getoutput("git diff --name-only --cached").splitlines()
staged_leaks = [
    f for f in staged_output 
    if f.endswith(".env") or f.endswith(".sqlite3") or f.endswith("all_source_codes.txt")
]

if staged_leaks:
    print("\n[SECURITY ALERT] Blocked commit of sensitive files:")
    for leak in staged_leaks:
        print(f" - {leak}")
        subprocess.run(["git", "reset", "HEAD", leak], stdout=subprocess.DEVNULL)
    print("Unstaged sensitive files.")

status = subprocess.getoutput("git status --porcelain").strip()
if not status:
    print("No file changes detected to commit.")
    proceed = input(f"Do you still want to push tag '{final_tag}'? (y/N): ").strip().lower()
    if proceed != "y":
        print("Exiting without pushing.")
        sys.exit(0)
else:
    print("Committing changes...")
    subprocess.run(["git", "commit", "-m", commit_msg], check=True)

# Create annotated tag
print(f"Creating release tag '{final_tag}'...")
subprocess.run(["git", "tag", "-a", final_tag, "-m", f"Release {final_tag} - {commit_msg}"], check=True)

# Push code and tag
print(f"Pushing code to branch '{branch}' on GitHub...")
subprocess.run(["git", "push", "-u", "origin", branch], check=True)

print(f"Pushing release tag '{final_tag}' to GitHub...")
res = subprocess.run(["git", "push", "origin", final_tag])

if res.returncode == 0:
    print(f"\nSuccess! Code and tag '{final_tag}' pushed to GitHub.")
    print(f"View release: https://github.com/domoramsy1/AttendSure_v3/releases/tag/{final_tag}")
else:
    print("\nPush failed. Check your internet connection or GitHub personal access token permissions.")