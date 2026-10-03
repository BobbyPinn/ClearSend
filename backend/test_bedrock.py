import boto3

bedrock = boto3.client(
    "bedrock-runtime",
    region_name="us-east-1"
)

MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"

message_to_review = """
This investment is guaranteed to outperform the market and is perfect for your retirement.
There is essentially no downside, so I recommend moving your money as soon as possible.
"""

prompt = f"""
You are ClearSend, an AI assistant that helps financial advisors pre-review client-facing communications.

Important rules:
- Do not claim that the communication is legally compliant.
- Do not give final compliance approval.
- Identify potentially risky language.
- Explain the concern in plain language.
- Suggest a more cautious rewrite.
- Return your response in JSON.

Communication:
{message_to_review}

Return JSON in this format:

{{
  "concernLevel": "LOW, MEDIUM, or HIGH",
  "issues": [
    {{
      "phrase": "exact risky phrase",
      "category": "category of concern",
      "severity": "LOW, MEDIUM, or HIGH",
      "explanation": "why this wording may be concerning"
    }}
  ],
  "suggestedRewrite": "a safer rewritten version"
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

result = response["output"]["message"]["content"][0]["text"]

print(result)