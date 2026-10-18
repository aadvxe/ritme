# Ritme — deployed architecture on Google Cloud

Editable Mermaid source. Paste the block into <https://mermaid.live> or any Markdown viewer that renders Mermaid
(GitHub, VS Code with a Mermaid extension).

```mermaid
flowchart TB
    subgraph Clients["Clients"]
        direction LR
        Web["Web app (React SPA)<br/>Dashboard, Clarity Canvas"]
        Ext["Chrome extension (MV3)<br/>Capture only"]
    end

    FirebaseAuth["Firebase Auth<br/>Google sign-in"]

    subgraph GCP["Google Cloud project · Jakarta (asia-southeast2)"]
        direction TB
        API["Cloud Run: ritme-api<br/>Public · serves SPA + API · ROLE=api"]
        Tasks["Cloud Tasks<br/>Run queue"]
        Worker["Cloud Run: ritme-worker<br/>Private · OIDC · ROLE=worker<br/>orchestrator + ai-engine"]
        SQL[("Cloud SQL (PostgreSQL)<br/>Source of truth · full-text search")]
        Secrets["Secret Manager<br/>DB password, extension token key"]
        Vertex["Vertex AI (Gemini)<br/>ADC, no API keys"]
        Logs["Cloud Logging / Monitoring<br/>Allowlisted fields only"]
    end

    subgraph Delivery["Delivery"]
        direction LR
        Build["Cloud Build"] --> Registry["Artifact Registry<br/>one image, two roles"]
        Registry --> MigJob["Cloud Run Job<br/>Alembic migrations"]
    end

    Web -- "sign in" --> FirebaseAuth
    Web -- "Firebase ID token" --> API
    Ext -- "scoped token<br/>captures:write only" --> API
    API -. "verifies ID token" .-> FirebaseAuth

    API -- "enqueue run (id only)" --> Tasks
    Tasks -- "HTTP + OIDC" --> Worker
    Worker -- "Gemini calls" --> Vertex

    API --> SQL
    Worker --> SQL
    MigJob --> SQL

    Secrets -. "mounted as env" .-> API
    Secrets -. "mounted as env" .-> Worker
    API -.-> Logs
    Worker -.-> Logs

    Registry -. "deploy" .-> API
    Registry -. "deploy" .-> Worker

    classDef compute fill:#E1F5EE,stroke:#0F6E56,color:#085041;
    classDef data fill:#EEEDFE,stroke:#534AB7,color:#3C3489;
    classDef ops fill:#F1EFE8,stroke:#5F5E5A,color:#444441;
    class API,Tasks,Worker,MigJob compute;
    class SQL,Secrets,Vertex,FirebaseAuth data;
    class Web,Ext,Logs,Build,Registry ops;
```

## Notes

- **Two Cloud Run services from one image.** `ROLE=api` is public; `ROLE=worker` is private (only the Cloud Tasks service
  account may invoke it). The AI engine is a Python library inside the worker image, not a third service.
- **Service accounts (least privilege, no key files):**
  - `ritme-api`: `cloudsql.client`, `secretmanager.secretAccessor` (named secrets), `cloudtasks.enqueuer`,
    `aiplatform.user` (short steps such as draft clarification).
  - `ritme-worker`: `cloudsql.client`, `secretmanager.secretAccessor`, `aiplatform.user`.
  - Cloud Tasks invoker: `run.invoker` on `ritme-worker` only.
- **Vertex AI region** (`VERTEX_LOCATION`) may differ from the Jakarta region depending on model availability; the README
  must state where prompts are processed.
- **Cloud SQL** is reached through Cloud Run's built-in Cloud SQL connection (unix socket); no public authorized networks.
- **Cost control:** billing budget alert, `min-instances` configurable (set to 1 before a demo), Vertex quota awareness.
- Nothing here is provisioned yet; deployment steps will be listed in `docs/infrastructure.md`.
