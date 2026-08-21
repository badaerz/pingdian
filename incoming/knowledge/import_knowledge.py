import os
import json
import glob

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(CURRENT_DIR, "literary_knowledge_base.json")
TEXTS_DIR = os.path.join(CURRENT_DIR, "texts")

def validate_and_inspect_dataset():
    print("=== [Story Forge] 文学知识库数据自检程序 ===")

    if not os.path.exists(JSON_PATH):
        print(f"❌ 未找到核心数据文件: {JSON_PATH}")
        return

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"✅ 成功加载结构化知识库，共包含作品: {len(data)} 部")

    total_characters = 0
    total_imagery = 0
    total_techniques = 0

    for idx, item in enumerate(data, 1):
        work_id = item.get("id")
        title = item.get("title")
        author = item.get("author")
        status = item.get("copyright", {}).get("status")
        nodes_count = len(item.get("character_graph", {}).get("nodes", []))
        blueprint_count = len(item.get("plot_blueprint", []))
        imagery_count = len(item.get("imagery_and_symbols", []))

        total_characters += nodes_count
        total_imagery += imagery_count

        print(f"  [{idx}] 《{title}》 | 作者: {author} | 版权: {status}")
        print(f"      └─ 故事蓝图节点: {blueprint_count} 阶段 | 人物图谱节点: {nodes_count} | 意象数: {imagery_count}")

    # 检查 Markdown 文件
    md_files = glob.glob(os.path.join(TEXTS_DIR, "*.md"))
    print(f"\n✅ 成功扫描配套语料文件: {len(md_files)} 篇")
    for mf in md_files:
        print(f"  - {os.path.basename(mf)} ({os.path.getsize(mf)} bytes)")

    print("\n📊 存储与容量评估（针对 Supabase Free 500MB）:")
    json_size_kb = os.path.getsize(JSON_PATH) / 1024
    print(f"  - 结构化 JSON 体积: ~{json_size_kb:.2f} KB (极度精简，占免费版配额 < 0.05%)")
    print(f"  - 适合前端 Mock/预制演示，亦支持一键 Upsert 至 Supabase 表 `kb_works`。")

if __name__ == "__main__":
    validate_and_inspect_dataset()
