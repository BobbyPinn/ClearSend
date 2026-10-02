# ClearSend RAG Component

**Owner:** Abigael

## What ClearSend is

ClearSend is an LPL Financial hackathon prototype for AI-assisted pre-review of financial-advisor communications (emails, follow-ups, marketing and social content). It surfaces potentially relevant compliance guidance while an advisor drafts, before the communication enters a firm's normal compliance process.

ClearSend is not an LPL Financial product, does not use or claim access to LPL proprietary internal policies, and does not replace compliance professionals or supervisory procedures.

## Scope of this component

This directory holds the retrieval/compliance knowledge layer: the synthetic policy corpus in `policies/`, the retrieval integration code in `src/`, and retrieval relevance tests in `tests/`.

**In scope:** policy corpus authoring, retrieval integration, retrieval evaluation.

**Out of scope:** frontend UX (Jesus), backend APIs, AWS application integration, Bedrock compliance analysis, DynamoDB (Ayush).

## Policy corpus

`rag/policies/` contains 11 plain-text synthetic compliance review documents:

| Regulator | Count | Documents |
|---|---|---|
| FINRA | 5 | FINRA-001 through FINRA-005 |
| SEC | 6 | SEC-001 through SEC-006 |

FINRA documents are grounded in FINRA Rule 2210 communications-with-the-public provisions. SEC documents are grounded in Investment Advisers Act Rule 206(4)-1, the SEC Investment Adviser Marketing Rule.

**Format.** Documents are `.txt` files placed directly in `rag/policies/`. There is no YAML frontmatter and no category subdirectory structure.

**Metadata.** Each document carries its own metadata as human-readable labeled fields in the body text:

```
POLICY ID:
TITLE:
REGULATOR:
PRIMARY SOURCE:
CATEGORY:
POLICY TYPE:
```

Additional sections per document: `PURPOSE`, `SYNTHETIC REVIEW POLICY`, `REVIEW SIGNALS`, `RETRIEVAL EXAMPLES`, `EXPECTED CLEARSEND BEHAVIOR`, `SUGGESTED LABEL`, `PROTOTYPE SEVERITY`, `SOURCE BASIS`, `DISCLAIMER`. SEC documents additionally carry an `APPLICABILITY NOTE`.

Because metadata is plain text rather than structured frontmatter, the fields are not queryable as filterable metadata attributes unless an ingestion step parses them out.

## Regulatory grounding and limitations

These are synthetic demonstration policies derived from publicly available regulatory material for a hackathon prototype. They are **not** official LPL Financial policies, and are not FINRA or SEC policy documents. Each document carries a disclaimer to that effect.

The retrieval layer retrieves potentially relevant policy context. It does **not** determine whether a communication is compliant, whether it violates a rule, or whether any exception applies. Final contextual analysis belongs to the backend/compliance-analysis layer, not to this layer.

## Planned AWS flow

Not yet implemented. No AWS resources are deployed for this component.

```
policy documents (policies/*.txt)
  → Amazon S3
  → Amazon Bedrock Knowledge Base (embeddings + vector index)
  → vector retrieval
  → relevant policy results
  → backend (Ayush)
```

S3 bucket and Bedrock Knowledge Base configuration are owned by Ayush.

## Structure

```
rag/
├── policies/   11 synthetic policy .txt documents
├── src/        retrieval integration code (not yet implemented)
├── tests/      retrieval relevance tests (not yet implemented)
└── README.md
```