"""
AttendSure V3 - Safe GitHub Deployment Script
File: D:\AttendSure_V3\push_to_github.py

Cybersecurity & Automation:
1. Strict Security Rules: Automatically checks and updates .gitignore.
2. Leak Protection: Blocks and unstages .env, database, and credential files.
3. Zero-Change Guard: Immediately cancels the process if no files have changed.
4. Dynamic Semantic Tagging: Increases the revision number automatically (e.g. v3.0.12 -> v3.0.13).
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

print("Checking .gitignore rules...")

existing_rules = set()
if os.path.exists(GITIGNORE_PATH):
    with open(GITIGNORE_PATH, "r", encoding="utf-8") as f:
        existing_rules = {line.strip() for line in f if line.strip()}

missing_rules = [r for r in REQUIRED_IGNORES if r not in existing_rules]

if not os.path.exists(GITIGNORE_PATH):
    with open(GITIGNORE_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(REQUIRED_IGNORES) + "\n")
    print("Created .gitignore file with security rules.")
elif missing_rules:
    with open(GITIGNORE_PATH, "a", encoding="utf-8") as f:
        f.write("\n" + "\n".join(missing_rules) + "\n")
    print(f"Added {len(missing_rules)} missing protection rules to .gitignore.")

# ---------------------------------------------------------------------------
# 2. GIT SETUP & REMOVE TRACKED SENSITIVE FILES
# ---------------------------------------------------------------------------
try:
    subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
except subprocess.CalledProcessError:
    print("Setting up Git repository...")
    subprocess.run(["git", "init"], check=True)
    subprocess.run(["git", "branch", "-M", "main"], check=True)

user_name = subprocess.getoutput("git config user.name").strip()
user_email = subprocess.getoutput("git config user.email").strip()
if not user_name:
    subprocess.run(["git", "config", "user.name", "Ramsy Domo"])
if not user_email:
    subprocess.run(["git", "config", "user.email", "ramsy.domo@attendsure.local"])

# Untrack any sensitive files that were added before
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
    subprocess.run(
        ["git", "rm", "--cached", "-r", "-q", "--ignore-unmatch", pat],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

# ---------------------------------------------------------------------------
# 3. STAGE FILES & CHECK FOR LEAKS
# ---------------------------------------------------------------------------
print("Staging project files...")
subprocess.run(["git", "add", "."], check=True)

# Block private keys and database files if staged
staged_output = subprocess.getoutput("git diff --name-only --cached").splitlines()
staged_leaks = [
    f
    for f in staged_output
    if f.endswith(".env") or f.endswith(".sqlite3") or f.endswith("all_source_codes.txt")
]

if staged_leaks:
    print("\n[SECURITY WARNING] Sensitive files blocked from upload:")
    for leak in staged_leaks:
        print(f" - {leak}")
        subprocess.run(["git", "reset", "HEAD", leak], stdout=subprocess.DEVNULL)
    print("Unstaged sensitive files successfully.")

# ---------------------------------------------------------------------------
# 4. ZERO-CHANGE GUARD: STOP IF NO FILES CHANGED
# ---------------------------------------------------------------------------
status = subprocess.getoutput("git status --porcelain").strip()
if not status:
    print("\nNo file changes detected across your project.")
    print("Nothing to commit or push. Exiting safely.")
    sys.exit(0)

# ---------------------------------------------------------------------------
# 5. REMOTE REPOSITORY CONFIGURATION
# ---------------------------------------------------------------------------
default_repo_url = "https://github.com/domoramsy1/AttendSure_v3.git"
remotes = subprocess.getoutput("git remote").split()

if not remotes:
    print("\nNo GitHub remote found.")
    input_url = input(f"Enter GitHub Repo URL (Press Enter for '{default_repo_url}'): ").strip()
    repo_url = input_url if input_url else default_repo_url
    subprocess.run(["git", "remote", "add", "origin", repo_url], check=True)
    print(f"Connected remote: {repo_url}")
else:
    current_origin = subprocess.getoutput("git remote get-url origin").strip()
    print(f"Remote repository: {current_origin}")

# ---------------------------------------------------------------------------
# 6. DYNAMIC TAG CALCULATION (+1 on last number)
# ---------------------------------------------------------------------------
print("\nFetching latest tags from GitHub...")
subprocess.run(["git", "fetch", "--tags", "-q", "origin"], stderr=subprocess.DEVNULL)

raw_tags = subprocess.getoutput("git tag -l").splitlines()
parsed_tags = []

for tag_name in raw_tags:
    clean = tag_name.strip().lstrip("vV")
    parts = clean.split(".")
    if len(parts) >= 2 and all(p.isdigit() for p in parts):
        parsed_tags.append(([int(p) for p in parts], tag_name.strip()))

if parsed_tags:
    # Sort numerically so v3.0.12 is newer than v3.0.9
    parsed_tags.sort(key=lambda item: item[0])
    highest_parts, latest_tag = parsed_tags[-1]

    highest_parts[-1] += 1
    suggested_tag = "v" + ".".join(str(p) for p in highest_parts)
    print(f"Latest Tag Found: {latest_tag}")
    print(f"Next Tag: {suggested_tag}")
else:
    suggested_tag = "v3.0.13"
    print(f"No existing tags found. Starting at: {suggested_tag}")

tag_input = input(f"\nRelease Tag (Press Enter to use '{suggested_tag}'): ").strip()
final_tag = tag_input if tag_input else suggested_tag

# ---------------------------------------------------------------------------
# 7. COMMIT & PUSH
# ---------------------------------------------------------------------------
branch = subprocess.getoutput("git branch --show-current").strip()
if not branch:
    branch = "main"
    subprocess.run(["git", "branch", "-M", "main"])

now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
default_message = f"Release {final_tag} - {now_str}"
input_msg = input(f"Enter commit message (Press Enter for '{default_message}'): ").strip()
commit_msg = input_msg if input_msg else default_message

print("Committing changes...")
subprocess.run(["git", "commit", "-m", commit_msg], check=True)

print(f"Creating release tag '{final_tag}'...")
subprocess.run(
    ["git", "tag", "-a", final_tag, "-m", f"Release {final_tag} - {commit_msg}"],
    check=True,
)

print(f"Pushing code to branch '{branch}' on GitHub...")
subprocess.run(["git", "push", "-u", "origin", branch], check=True)

print(f"Pushing tag '{final_tag}' to GitHub...")
res = subprocess.run(["git", "push", "origin", final_tag])

if res.returncode == 0:
    print(f"\nSuccess! Files and release tag '{final_tag}' pushed to GitHub.")
    print(f"Release Link: https://github.com/domoramsy1/AttendSure_v3/releases/tag/{final_tag}")
else:
    print("\nPush failed. Check your internet connection or GitHub personal access token.")