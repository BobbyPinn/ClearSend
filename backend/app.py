import json
import re
import uuid
from datetime import datetime, timezone

import boto3

bedrock = boto3.client(
    "bedrock-runtime",
    region_name="us-east-1"
)

kb = boto3.client(
    "bedrock-agent-runtime",
    region_name="us-east-1"
)

dynamodb = boto3.resource(
    "dynamodb",
    region_name="us-east-1"
)

reviews_table = dynamodb.Table("clearsend-reviews")

KNOWLEDGE_BASE_ID = "MW45GBAMOF"

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

def retrieve_policies(message):
    response = kb.retrieve(
        knowledgeBaseId=KNOWLEDGE_BASE_ID,
        retrievalQuery={
            "text": message
        },
        retrievalConfiguration={
            "managedSearchConfiguration": {
                "numberOfResults": 3
            }
        }
    )

    results = response.get("retrievalResults", [])

    policies = []

    for result in results:
        content = result.get("content", {})
        text = content.get("text", "")

        if text:
            policies.append({
                "text": text,
                "score": result.get("score"),
                "location": result.get("location", {})
            })

    return policies


def review_message(message, communication_type="client_email", audience="existing_client"):
    prompt = f"""
You are ClearSend, an AI assistant that helps financial advisors pre-review client-facing communications.

Important rules:
- Do not claim that the communication is legally compliant.
- Do not give final compliance approval.
- Identify potentially risky language.
- Explain each concern in plain language.
- Suggest a more cautious rewrite.
- Do not invent specific laws, violations, or regulatory conclusions.
- Return ONLY valid JSON.
- Do not wrap the JSON in markdown code fences.
- For every issue, identify which retrieved POLICY number supports the concern.

Communication type: {communication_type}
Audience: {audience}

Communication:
{message}

Return JSON in exactly this structure:

{{
  "concernLevel": "LOW, MEDIUM, or HIGH",
  "issues": [
    {{
      "phrase": "exact phrase from the communication",
      "category": "general category of concern",
      "severity": "LOW, MEDIUM, or HIGH",
      "explanation": "plain-English explanation grounded in the retrieved policies",
      "policyReference": "POLICY 1, POLICY 2, etc."
    }}
  ],
  "suggestedRewrite": "a more cautious rewritten version"
}}

{{
  "concernLevel": "LOW, MEDIUM, or HIGH",
  "issues": [
    {{
      "phrase": "exact phrase from the communication",
      "category": "general category of concern",
      "severity": "LOW, MEDIUM, or HIGH",
      "explanation": "plain-English explanation"
    }}
  ],
  "suggestedRewrite": "a more cautious rewritten version"
}}
"""

    response = bedrock.converse(
        modelId=MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    )

    policies = retrieve_policies(message)

    policy_context_parts = []

    for i, policy in enumerate(policies, start=1):
        policy_context_parts.append(
            f"""
    POLICY {i}
    Relevance score: {policy.get("score")}
    Text:
    {policy.get("text")}
    """
        )

    policy_context = "\n\n".join(policy_context_parts)

    model_text = response["output"]["message"]["content"][0]["text"]

    # Remove Markdown code fences if the model includes them
    cleaned_text = model_text.strip()

    if cleaned_text.startswith("```json"):
        cleaned_text = cleaned_text[7:]
    elif cleaned_text.startswith("```"):
        cleaned_text = cleaned_text[3:]

    if cleaned_text.endswith("```"):
        cleaned_text = cleaned_text[:-3]

    cleaned_text = cleaned_text.strip()

    return json.loads(cleaned_text)


def _extract_json(text):
    """Strip markdown code fences (```json ... ```) if present, then return the JSON string."""
    stripped = text.strip()

    # Remove a leading fence like ``` or ```json
    stripped = re.sub(r"^```[a-zA-Z]*\s*", "", stripped)
    # Remove a trailing fence
    stripped = re.sub(r"\s*```$", "", stripped)

    return stripped.strip()

def save_review(
    message,
    communication_type,
    audience,
    result
):
    review_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).isoformat()

    item = {
        "reviewID": review_id,
        "timestamp": timestamp,
        "communicationType": communication_type,
        "audience": audience,
        "message": message,
        "concernLevel": result.get("concernLevel"),
        "issues": result.get("issues", []),
        "suggestedRewrite": result.get("suggestedRewrite", "")
    }

    reviews_table.put_item(Item=item)

    return review_id

def lambda_handler(event, context):
    try:
        body = event.get("body", {})

        if isinstance(body, str):
            body = json.loads(body)

        message = body.get("message")
        communication_type = body.get(
            "communicationType",
            "client_email"
        )
        audience = body.get(
            "audience",
            "existing_client"
        )

        if not message:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": json.dumps({
                    "error": "message is required"
                })
            }

        result = review_message(
            message,
            communication_type,
            audience
        )

        review_id = save_review(
            message,
            communication_type,
            audience,
            result
        )

        result["reviewID"] = review_id

        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps(result)
        }

    except Exception as e:
        print("ERROR:", str(e))

        return {
            "statusCode": 500,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            "body": json.dumps({
                "error": str(e)
            })
        }