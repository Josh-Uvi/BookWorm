# Deploying to Google Cloud

Server → **Cloud Run** (supports WebSockets) · Client → **Cloud Storage + Cloud CDN**.
Deployment is automated by `.github/workflows/deploy-gcp.yml` (tag `v*` or manual dispatch).

## 0. Prerequisites

- `gcloud` CLI, a GCP project with billing, and roles to create Artifact Registry, Cloud Run,
  and GCS resources
- The GitHub repo's Actions configured with the secrets from §3

## 1. Enable APIs and create the Artifact Registry

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
    storage.googleapis.com iamcredentials.googleapis.com
gcloud artifacts repositories create reading-assistant \
    --repository-format=docker --location=europe-west2
```

## 2. Workload Identity Federation (no static keys)

```bash
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create oidc github \
    --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping="google.subject=assertion.sub" \
    --attribute-condition="assertion.repository=='YOUR_GITHUB_ORG/YOUR_REPO'"
gcloud iam service-accounts create gh-deployer
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/YOUR_GITHUB_ORG/YOUR_REPO" \
    --role="roles/iam.workloadIdentityUser"
```

Grant `gh-deployer` the needed roles: `roles/artifactregistry.writer`, `roles/run.admin`,
`roles/iam.serviceAccountUser`, `roles/storage.admin` on the client bucket.

## 3. GitHub secrets

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | Your project id |
| `GCP_REGION` | e.g. `europe-west2` |
| `GCP_SERVICE_ACCOUNT` | `gh-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_WIF_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github` |
| `GCP_LLM_BASE_URL` | LLM endpoint reachable from Cloud Run (see §4) |
| `GCP_LLM_MODEL` | Model name at that endpoint |
| `GCP_LLM_API_KEY` | API key (if the endpoint needs one; `ollama` otherwise) |

## 4. LLM strategy for Cloud Run

The server needs an OpenAI-compatible LLM endpoint. Pick one:

- **Hosted endpoint (simplest)** — Groq/OpenAI/vLLM service: set `GCP_LLM_BASE_URL` etc.
  Nothing else to run.
- **Ollama sidecar (self-contained)** — bake the lightweight model into a custom image:
  ```dockerfile
  FROM ollama/ollama
  RUN ollama pull llama3.2:1b
  ```
  Deploy it as a second Cloud Run service and point `LLM_BASE_URL` at its internal URL, or run
  it on a GCE VM / GKE for sustained load.

## 5. First deploy + books

Tag a release (`git tag v1.0.0 && git push --tags`) or run the workflow from the Actions tab.
The workflow builds/pushes the server image, deploys Cloud Run, builds the client and uploads
`dist/` to a versioned GCS bucket behind Cloud CDN.

Books live in the server container's media volume — mount a GCS bucket at `/data/media`
(`--volume` flag on Cloud Run) or upload them via `storage cp`:

```bash
gcloud storage cp media/* gs://YOUR_BUCKET/
```

## 6. Routing & TLS

- Client: map your domain to the load balancer (Cloud CDN) — TLS terminates there.
- Server: `myserver-xxxx.run.app` has managed TLS. Point the client's `VITE_WS_URL` build arg
  (`wss://…`) **or** keep same-origin `/ws` by fronting both with a single domain (HTTPS LB
  with a `/ws` URL-map rule to the Cloud Run server and `/*` to the CDN backend).

## 7. GPU (optional)

faster-whisper performs much better with a GPU. Cloud Run supports NVIDIA L4:

```bash
gcloud run deploy reading-assistant-server --image … \
    --gpu=nvidia-l4 --gpu-count=1 --concurrency=1 --cpu=4 --memory=8Gi
```

For sustained multi-user load prefer GKE with node auto-provisioning for GPUs.
