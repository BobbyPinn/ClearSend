from app import lambda_handler

event = {
    "body": {
        "communicationType": "client_email",
        "audience": "existing_client",
        "message": "This investment is guaranteed to outperform the market and has virtually no downside."
    }
}

response = lambda_handler(event, None)

print(response)