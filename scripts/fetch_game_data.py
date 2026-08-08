import os
import json
import requests
import hashlib
import subprocess
import shutil
from typing import Dict, Any

DATA_URL = [
    "https://raw.githubusercontent.com/silent1b/MWIData/main/init_client_info.json",
    "https://raw.githubusercontent.com/holychikenz/MWIApi/main/milkyapi.json",
]

OUTPUT_DIR = "./public/data"
OUTPUT_JSON = [f"{OUTPUT_DIR}/data.json", f"{OUTPUT_DIR}/market.json"]

def get_file_hash(data: Dict[str, Any]) -> str:
    """计算数据的 MD5 哈希值"""
    json_str = json.dumps(data, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()

def fetch_data(url: str) -> Dict[str, Any]:
    """从远程获取 JSON 数据"""
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

def save_as_json(data: Dict[str, Any], output_file: str) -> None:
    """保存数据为 JSON 文件"""
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_existing_json(file_path: str) -> Dict[str, Any] | None:
    """加载本地（gh-pages 分支）的 JSON 文件"""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def deploy_to_gh_pages() -> None:
    """部署 public/data 到 gh-pages 分支"""
    github_repository = os.environ.get("GITHUB_REPOSITORY")
    github_token = os.environ.get("GITHUB_TOKEN")

    if not github_repository or not github_token:
        raise ValueError("Missing environment variables")

    temp_dir = "gh-pages-temp"
    try:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

        subprocess.run([
            "git", "clone",
            "--branch", "gh-pages",
            "--single-branch",
            f"https://x-access-token:{github_token}@github.com/{github_repository}.git",
            temp_dir
        ], check=True)

        target_data_dir = os.path.join(temp_dir, "data")
        if os.path.exists(target_data_dir):
            shutil.rmtree(target_data_dir)
        shutil.copytree(OUTPUT_DIR, target_data_dir)

        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=temp_dir,
            capture_output=True,
            text=True,
            check=True
        )
        if not result.stdout.strip():
            print("⚠️ No changes to commit, skipping deployment")
            return

        subprocess.run(["git", "config", "user.name", "GitHub Actions"], cwd=temp_dir, check=True)
        subprocess.run(["git", "config", "user.email", "actions@github.com"], cwd=temp_dir, check=True)
        subprocess.run(["git", "add", "."], cwd=temp_dir, check=True)
        subprocess.run(["git", "commit", "-m", "Update data files via GitHub Actions"], cwd=temp_dir, check=True)
        subprocess.run(["git", "push"], cwd=temp_dir, check=True)
        print("✅ Successfully deployed data to gh-pages branch")
    except subprocess.CalledProcessError as e:
        print(f"❌ Deployment failed: {e}")
        raise
    finally:
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

def main() -> None:
    has_changes = False

    # 检查并更新数据
    for url, output_file in zip(DATA_URL, OUTPUT_JSON):
        new_data = fetch_data(url)
        existing_data = load_existing_json(output_file)  # 从 gh-pages 分支加载

        if existing_data is None:
            save_as_json(new_data, output_file)
            has_changes = True
            print(f"Created new file: {output_file}")
        else:
            new_hash = get_file_hash(new_data)
            existing_hash = get_file_hash(existing_data)
            if new_hash != existing_hash:
                save_as_json(new_data, output_file)
                has_changes = True
                print(f"Updated file: {output_file}")
                print(f"New Time: {new_data.get('time')}")
                print(f"Old Time: {existing_data.get('time')}")
            else:
                print(f"No changes in: {output_file}")

    # 若有变更，直接部署到 gh-pages
    if has_changes:
        deploy_to_gh_pages()
    else:
        print("No changes detected, skipping deployment")

if __name__ == "__main__":
    main()
