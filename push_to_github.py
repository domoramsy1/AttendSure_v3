import os
import sys
import re
import subprocess
from datetime import datetime

def run_cmd(cmd, check=False):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"Error executing: {cmd}")
        print(result.stderr)
    return result

# 1. Project root setup
root_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(root_dir)

print("=" * 60)
print("AttendSure V3 - Safe GitHub Deployment & Complete ZIP Packaging")
print("=" * 60)

# 2. Create clean .env.example templates for teammates
for env_rel in ["backend/.env", "mobile/.env", "web/.env"]:
    env_path = os.path.join(root_dir, env_rel)
    example_path = env_path + ".example"
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        clean = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                clean.append(line)
            elif "=" in line:
                k = line.split("=")[0].strip()
                clean.append(f"{k}=your_{k.lower()}_here\n")
            else:
                clean.append(line)
        with open(example_path, "w", encoding="utf-8") as f:
            f.writelines(clean)

# 3. Cybersecurity: Enforce strict .gitignore rules
gitignore_path = os.path.join(root_dir, ".gitignore")
required_ignores = [
    ".env", ".env.*", "*.env", "**/.env", "backend/.env", "mobile/.env", "web/.env",
    "db.sqlite3", "*.sqlite3", "*.db", "all_source_codes.txt", "project_files.txt",
    "*.keystore", "*.jks", "*.pem", "*.key", "*.p12", "*.pfx",
    "google-services.json", "GoogleService-Info.plist",
    "node_modules/", "__pycache__/", "*.pyc", "venv/", "env/", ".venv/",
    "dist/", "build/", ".expo/", ".vscode/", "*.log"
]
existing = set()
if os.path.exists(gitignore_path):
    with open(gitignore_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            existing.add(line.strip().lower())
missing = [r for r in required_ignores if r.strip().lower() not in existing]
if missing:
    with open(gitignore_path, "a", encoding="utf-8") as f:
        f.write("\n" + "\n".join(missing) + "\n")
    print(f"[Security] Added {len(missing)} missing rules to .gitignore")

# 4. Remove accidentally cached sensitive files
sensitive = [".env", "*.env", "backend/.env", "mobile/.env", "web/.env", "db.sqlite3", "*.sqlite3", "*.keystore", "*.jks"]
for pat in sensitive:
    run_cmd(f'git rm --cached -r -q --ignore-unmatch "{pat}"')

# 5. Stage all project files
print("\nStaging all project codes and files...")
run_cmd("git add -A")

# 6. Block sensitive credentials from being committed
staged_res = run_cmd("git diff --name-only --cached")
staged_files = [f.strip() for f in staged_res.stdout.splitlines() if f.strip()]
leak_pattern = re.compile(r'(\.env|\.sqlite3|all_source_codes\.txt|\.keystore|\.jks|\.key|\.pem)$', re.IGNORECASE)
leaks = [f for f in staged_files if leak_pattern.search(f)]
if leaks:
    print("\n[SECURITY ALERT] Sensitive files blocked from upload:")
    for lk in leaks:
        print(f" - {lk}")
        run_cmd(f'git reset HEAD "{lk}"')
    print("Sensitive files unstaged safely.")

# 7. Dynamic Tag Calculation (+0.0.1 automatic increment)
print("\nFetching latest tags from GitHub...")
run_cmd("git fetch --tags -q origin")
tags_res = run_cmd("git tag -l")
tags = [t.strip() for t in tags_res.stdout.splitlines() if t.strip()]

parsed = []
for t in tags:
    clean = t.lstrip("vV")
    m = re.match(r"^(\d+)\.(\d+)\.(\d+)$", clean)
    if m:
        parsed.append((int(m.group(1)), int(m.group(2)), int(m.group(3)), t))

if parsed:
    parsed.sort()
    major, minor, patch, raw = parsed[-1]
    suggested_tag = f"v{major}.{minor}.{patch + 1}"
    print(f"Latest Tag Found : {raw}")
    print(f"Next Release Tag : {suggested_tag}")
else:
    suggested_tag = "v3.0.15"
    print(f"No existing tags found. Starting at: {suggested_tag}")

tag_input = input(f"\nRelease Tag (Press Enter for '{suggested_tag}'): ").strip()
final_tag = tag_input if tag_input else suggested_tag

# 8. Check branch and commit changes
branch_res = run_cmd("git branch --show-current")
branch = branch_res.stdout.strip() or "main"

status_res = run_cmd("git status --porcelain")
has_changes = bool(status_res.stdout.strip())

now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
default_msg = f"Release {final_tag} - Complete Project Package ({now_str})"
msg_input = input(f"Commit message (Press Enter for '{default_msg}'): ").strip()
commit_msg = msg_input if msg_input else default_msg

if has_changes:
    print("\nCommitting changes...")
    run_cmd(f'git commit -m "{commit_msg}"')
    print(f"Pushing code to branch '{branch}' on GitHub...")
    run_cmd(f"git push -u origin {branch}")
else:
    print("\nWorking directory clean. Tagging current commit...")

# 9. Create and push Git tag
print(f"Creating release tag '{final_tag}'...")
run_cmd(f'git tag -a "{final_tag}" -m "{commit_msg}"')
print(f"Pushing tag '{final_tag}' to GitHub...")
push_tag_res = run_cmd(f'git push origin "{final_tag}"')

# 10. Generate Complete Team ZIP (100% of project source codes)
zip_name = f"AttendSure_V3_{final_tag}.zip"
zip_path = os.path.join(root_dir, zip_name)
print(f"\nPackaging complete project ZIP for your team: {zip_name}...")
run_cmd(f'git archive --format=zip --output="{zip_path}" HEAD')

if os.path.exists(zip_path):
    size_mb = round(os.path.getsize(zip_path) / (1024 * 1024), 2)
    print(f"SUCCESS: Team ZIP Created: {zip_name} ({size_mb} MB)")
    print(f"Location: {zip_path}")

if push_tag_res.returncode == 0:
    print(f"\nSuccess! Release '{final_tag}' published to GitHub.")
    print(f"GitHub Tag URL : https://github.com/domoramsy1/AttendSure_v3/releases/tag/{final_tag}")
    print(f"Team ZIP File  : {zip_path}")
else:
    print(f"\nPush completed: {push_tag_res.stderr.strip()}")