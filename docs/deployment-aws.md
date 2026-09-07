# Deploying to AWS

Server → **ECS Fargate** behind an **ALB** (WebSocket target group) · Client → **S3 +
CloudFront**. Deployment is automated by `.github/workflows/deploy-aws.yml` (tag `v*` or
manual dispatch). Note: AWS is used here purely for *hosting* — all AI components remain
open-source and swappable.

## 0. Prerequisites

- AWS CLI configured, an VPC with public subnets, and permission to create ECR/ECS/ALB/S3
  resources

## 1. GitHub OIDC provider (no static keys)

```bash
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
```

Then create an IAM role (`gh-deployer`) trusting that provider with
`subject` = `repo:YOUR_GITHUB_ORG/YOUR_REPO:ref:refs/tags/v*`, granting
`AmazonEC2ContainerRegistryFullAccess`, `AmazonECSFullAccess`, and `AmazonS3FullAccess`
scoped to the client bucket (tighten in production).

## 2. Create the infrastructure

```bash
aws ecr create-repository --repository-name reading-assistant/server
aws ecr create-repository --repository-name reading-assistant/client
aws s3 mb s3://YOUR-CLIENT-BUCKET

aws ecs create-cluster --cluster-name reading-assistant
# ALB with an HTTP:80 listener → target group (protocol HTTP, health check /health,
# idle timeout raised to 3600s — WebSockets)
# Fargate task definition: deploy/aws/ecs-task-definition.json in this repo
aws ecs register-task-definition --cli-input-json file://deploy/aws/ecs-task-definition.json
aws ecs create-service --cluster reading-assistant --service-name server \
    --task-definition reading-assistant-server --desired-count 1 \
    --launch-type FARGATE --network-configuration …
```

## 3. GitHub secrets

| Secret | Value |
|---|---|
| `AWS_ROLE_ARN` | `arn:aws:iam::ACCOUNT:role/gh-deployer` |
| `AWS_REGION` | e.g. `eu-west-1` |
| `AWS_ECR_SERVER` / `AWS_ECR_CLIENT` | Full ECR repository URIs |
| `AWS_S3_BUCKET` | Client bucket name |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | For cache invalidation |
| `AWS_ECS_CLUSTER` / `AWS_ECS_SERVICE` / `AWS_ECS_TASK_FAMILY` | `reading-assistant` values |
| `AWS_LLM_BASE_URL` / `AWS_LLM_MODEL` / `AWS_LLM_API_KEY` | LLM endpoint reachable from Fargate |

**LLM strategy:** the task definition sets `LLM_*` from these secrets — point them at any
hosted OpenAI-compatible endpoint (Groq, OpenAI, Bedrock-compatible gateways, a vLLM EC2
instance, or an Ollama sidecar container in the same task). **TTS** runs fully offline: the
default Piper voice is baked into the server image at build time (`PIPER_VOICE` build arg),
so the Fargate task needs no extra volumes or internet access for speech.

## 4. Deploy

Tag a release (`git tag v1.0.0 && git push --tags`) or dispatch the workflow. It:

1. Authenticates via OIDC (`aws-actions/configure-aws-credentials@v4`)
2. Builds & pushes server + client images to ECR (client baked with same-origin `/ws`)
3. Renders + deploys the ECS task definition (`amazon-ecs-render/deploy-task-definition`)
4. Builds the client bundle and syncs it to S3, then invalidates CloudFront

## 5. Routing & TLS

- Client: CloudFront domain (or a Route 53 record). Enable **OAC** on the S3 origin.
- Server: an ALB listener rule routing `/ws/*` to the ECS target group keeps everything
  same-origin on one domain; otherwise set `VITE_WS_URL=wss://alb-domain` at build time.
- TLS: ACM certificate on the ALB/CloudFront; WebSocket requires `wss://` in production.

## 6. Books & scaling

- Books: bake into the server image, keep on an EFS volume mounted by the task, or point
  `STORAGE_PROVIDER=minio` at any S3-compatible store (including S3 itself via MinIO gateway).
- Scale: raise the service's desired count — sessions are fully stateless per connection.
  Add GPU EC2 capacity (EC2 launch type + `WHISPER_DEVICE=cuda`) when throughput demands it.
