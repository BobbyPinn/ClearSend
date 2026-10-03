import boto3

kb = boto3.client(
    "bedrock-agent-runtime",
    region_name="us-east-1"
)

KNOWLEDGE_BASE_ID = "MW45GBAMOF"

query = """
This investment is guaranteed to outperform the market
and has virtually no downside.
"""

response = kb.retrieve(
    knowledgeBaseId=KNOWLEDGE_BASE_ID,
    retrievalQuery={
        "text": query
    },
    retrievalConfiguration={
        "managedSearchConfiguration": {
            "numberOfResults": 3
        }
    }
)

results = response.get("retrievalResults", [])

print(f"Found {len(results)} results\n")

for i, result in enumerate(results, start=1):
    print(f"--- Result {i} ---")

    content = result.get("content", {})
    text = content.get("text", "")

    print(text)
    print("Score:", result.get("score"))
    print()