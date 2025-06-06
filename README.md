# Scalable Code Execution Orchestrator

A high-performance, cloud-native code execution platform built with TypeScript, Kubernetes, and Redis. This system provides secure, scalable code execution with intelligent auto-scaling capabilities and comprehensive monitoring.

<img width="710" alt="image" src="https://github.com/user-attachments/assets/ed014321-4e50-429f-8076-a61b2fd0836d" />

*System Architecture Overview*

## 🚀 Features

### Core Capabilities
- **Multi-language Support**: Execute code in Python, JavaScript (Node.js), C, and Java
- **Intelligent Auto-scaling**: Dynamic pod scaling based on queue length and CPU utilization
- **Secure Execution**: Isolated containers with configurable resource limits and timeouts
- **Batch Processing**: Submit multiple code execution jobs simultaneously
- **Webhook Integration**: Real-time callbacks with execution results
- **Comprehensive Monitoring**: Resource usage tracking and metrics collection

### Scalability & Performance
- **Kubernetes-native**: Leverages Kubernetes for container orchestration and scaling
- **Redis Queue Management**: High-throughput job queuing with Redis
- **Resource Optimization**: CPU and memory-based scaling decisions
- **Configurable Limits**: Per-job timeout and memory constraints
- **Production Ready**: Robust error handling and logging

## 🏗️ Architecture

The system follows a microservices architecture with the following components:

### Core Components

1. **API Server** (`src/api.ts`)
   - RESTful API for job submissions
   - Batch processing endpoint
   - Health monitoring

2. **Orchestrator** (`src/orchestrator.ts`)
   - Job queue management
   - Auto-scaling logic
   - Kubernetes integration

3. **Worker Nodes** (`src/worker.ts`)
   - Code execution engine
   - Multi-language runtime support
   - Result callback handling

4. **Kubernetes Manager** (`src/k8s.ts`)
   - Pod lifecycle management
   - Deployment scaling
   - Resource monitoring

### Supported Languages

| Language | Language ID | Runtime | Compilation |
|----------|-------------|---------|-------------|
| Python   | 71          | python3 | Interpreted |
| JavaScript | 63        | node    | Interpreted |
| C        | 50          | gcc     | Required    |
| Java     | 62          | javac/java | Required |

## 🛠️ Installation & Setup

### Prerequisites

- **Kubernetes Cluster** (v1.20+)
- **Redis Server** (v6.0+)
- **Node.js** (v16+)
- **Docker** (for containerization)

### Quick Start

1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/scalable-code-executor.git
   cd scalable-code-executor
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   # Set up your Kubernetes config
   export KUBECONFIG=/path/to/your/kubeconfig
   
   # Configure Redis connection (default: localhost:6379)
   export REDIS_HOST=your-redis-host
   export REDIS_PORT=6379
   ```

4. **Build and Deploy**
   ```bash
   # Build TypeScript
   npm run build
   
   # Start the API server
   npm run start:api
   
   # Start worker processes
   npm run start:worker
   ```

### Docker Deployment

```bash
# Build Docker images
docker build -t code-executor-api -f Dockerfile.api .
docker build -t code-executor-worker -f Dockerfile.worker .

# Deploy to Kubernetes
kubectl apply -f k8s/
```

## 📚 API Reference

### Submit Batch Jobs

**POST** `/submit/batch`

Submit multiple code execution jobs for processing.

```json
{
  "submissions": [
    {
      "source_code": "print('Hello, World!')",
      "language_id": 71,
      "problem_id": "prob-123",
      "callback_url": "https://your-webhook.com/callback",
      "timeout": 10000,
      "memory_limit": 512
    }
  ]
}
```

**Response:**
```json
{
  "tokens": ["uuid-token-1", "uuid-token-2"]
}
```

### Health Check

**GET** `/health`

Check API server health status.

**Response:**
```json
{
  "status": "healthy"
}
```

### Webhook Callback Format

Your callback URL will receive:

```json
{
  "token": "job-uuid",
  "stdout": "Hello, World!\n",
  "stderr": "",
  "status": "completed",
  "execution_time": 45.32,
  "exit_code": 0
}
```

## ⚙️ Configuration

### Scaling Configuration

```typescript
const scalingConfig = {
  minPods: 1,        // Minimum worker pods
  maxPods: 10,       // Maximum worker pods
  jobsPerPod: 5,     // Jobs per pod for scaling calculation
  checkIntervalMs: 10000  // Scaling check interval
};
```

### Resource Limits

```typescript
const executionLimits = {
  timeout: 10000,    // Maximum execution time (ms)
  memory_limit: 512, // Memory limit (MB)
  cpu_limit: "200m"  // CPU limit (millicores)
};
```

## 🔧 Development

### Project Structure

```
src/
├── api.ts          # REST API server
├── orchestrator.ts # Job orchestration and scaling
├── worker.ts       # Code execution worker
├── k8s.ts         # Kubernetes management
├── logger.ts      # Logging utilities
├── webhook.ts     # Webhook server for testing
├── seed.ts        # Test data generation
└── test.ts        # Integration tests
```

### Running Tests

```bash
# Run integration tests
npm run test

# Test with sample data
npm run seed

# Start webhook server for testing
npm run webhook
```

### Development Commands

```bash
# Start in development mode
npm run dev

# Build TypeScript
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## 📊 Monitoring & Observability

### Metrics Collection

The system collects the following metrics:

- **Queue Length**: Number of pending jobs
- **Worker Count**: Active worker pods
- **CPU Usage**: Per-pod CPU utilization
- **Memory Usage**: Per-pod memory consumption
- **Execution Time**: Job processing duration
- **Success Rate**: Job completion statistics

### Logging

Structured logging with different levels:

- `INFO`: General operational information
- `ERROR`: Error conditions and failures
- `DEBUG`: Detailed debugging information
- `WARN`: Warning conditions

### Health Monitoring

- API server health endpoint
- Kubernetes pod health checks
- Redis connection monitoring
- Auto-restart on failures

## 🔒 Security Considerations

### Execution Isolation

- Each job runs in an isolated container
- Resource limits prevent resource exhaustion
- Timeout mechanisms prevent infinite loops
- Memory limits prevent memory bombs

### Network Security

- Jobs have no network access by default
- Webhook URLs should be validated
- Use HTTPS for production callbacks
- Implement authentication for API endpoints

### Input Validation

- Source code size limits
- Language ID validation
- Timeout and memory limit bounds
- Malicious code detection (recommended)

## 🚦 Production Deployment

### Kubernetes Resources

```yaml
# Recommended resource requests/limits
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

### High Availability

1. **Multiple API Replicas**: Deploy multiple API server instances
2. **Redis Clustering**: Use Redis cluster for high availability
3. **Pod Disruption Budgets**: Ensure minimum pod availability
4. **Horizontal Pod Autoscaler**: Automatic scaling based on metrics

### Performance Tuning

- Adjust `jobsPerPod` based on workload characteristics
- Configure appropriate CPU/memory limits
- Tune Redis connection pooling
- Optimize Docker image sizes
