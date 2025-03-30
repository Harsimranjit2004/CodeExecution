import * as k8s from '@kubernetes/client-node';
import { kubernetesManager } from "./k8s.js" // Adjust path as needed

// Utility function for controlled waiting with a message
const wait = async (seconds: number, message: string) => {
    console.log(`⏱️ ${message} (waiting ${seconds}s)...`);
    await new Promise(r => setTimeout(r, seconds * 1000));
    console.log(`✓ Done waiting ${seconds}s`);
};

// Main execution function
(async () => {
    try {
        console.log("🚀 Starting Kubernetes test with scaling functionality");
        const k8 = new kubernetesManager();

        // List all namespaces
        console.log("📌 Listing Namespaces...");
        const namespaces = await k8.listNamespaces();
        console.log(`Found ${namespaces.length} namespaces: ${namespaces.join(', ')}`);

        // --- Test Pod Creation and Metrics ---
        const podLabel = "app=nginx";
        const podName = "test-nginx";

        // Check for existing pods
        console.log(`📌 Checking for existing pods with label "${podLabel}"...`);
        const existingPodCount = await k8.getPodWithLabel(podLabel);
        console.log(`Found ${existingPodCount} pod(s) with label ${podLabel}`);

        // Delete existing pod if found
        if (existingPodCount > 0) {
            console.log(`⚠️ Pod "${podName}" already exists. Deleting...`);
            await k8.deletePod(podName);
            await wait(10, "Waiting for pod deletion to complete");

            // Verify deletion
            const countAfterDelete = await k8.getPodWithLabel(podLabel);
            if (countAfterDelete > 0) {
                throw new Error(`Failed to delete pod "${podName}"`);
            }
            console.log("✅ Pod deleted successfully");
        }

        // Create a new pod
        const pod: k8s.V1Pod = {
            metadata: {
                name: podName,
                labels: {
                    app: "nginx",
                },
            },
            spec: {
                containers: [
                    {
                        name: "nginx",
                        image: "nginx",
                        ports: [{ containerPort: 80 }],
                        resources: {
                            requests: {
                                cpu: "100m",
                                memory: "64Mi"
                            },
                            limits: {
                                cpu: "200m",
                                memory: "128Mi"
                            }
                        }
                    },
                ],
            },
        };

        console.log("📌 Creating Pod...");
        const createdPod = await k8.createPod(pod);
        console.log(`✅ Pod created: ${createdPod.metadata?.name}`);

        // Wait for pod to become ready
        await wait(30, "Waiting for pod to start and become ready");

        // Fetch pod metrics with retry logic
        let usage: any = [];
        let attempts = 5;
        let waitTime = 10;

        while (attempts-- > 0 && usage.length === 0) {
            console.log(`📈 Fetching pod resource usage (attempt ${5 - attempts}/5)...`);
            usage = await k8.topPods(podLabel);

            if (usage.length === 0) {
                console.log(`ℹ️ No metrics available yet, backing off...`);
                await wait(waitTime, `Waiting before next metrics attempt`);
                waitTime = Math.min(waitTime * 2, 60);
            }
        }

        if (usage.length > 0) {
            console.log("✅ Pod resource usage successfully retrieved:");
            console.table(usage);
        } else {
            console.warn("⚠️ No resource usage data available after multiple attempts.");
        }

        // Clean up the test pod
        console.log("🧹 Cleaning up: Deleting test pod...");
        await k8.deletePod(podName);
        await wait(5, "Confirming pod deletion");
        console.log("✅ Test pod deleted successfully");

        // --- Test Scaling Deployment ---
        const deploymentName = "nginx-deployment";
        const deploymentLabel = "app=nginx-deployment";

        // Create a simple Nginx deployment
        const deployment: k8s.V1Deployment = {
            metadata: {
                name: deploymentName,
                labels: { app: "nginx-deployment" }
            },
            spec: {
                replicas: 2,  // Start with 2 replicas
                selector: {
                    matchLabels: { app: "nginx-deployment" }
                },
                template: {
                    metadata: {
                        labels: { app: "nginx-deployment" }
                    },
                    spec: {
                        containers: [
                            {
                                name: "nginx",
                                image: "nginx",
                                ports: [{ containerPort: 80 }],
                                resources: {
                                    requests: { cpu: "100m", memory: "64Mi" },
                                    limits: { cpu: "200m", memory: "128Mi" }
                                }
                            }
                        ]
                    }
                }
            }
        };

        console.log("📌 Creating Nginx Deployment...");
        await k8.createDeployment(deployment);  // Add this method below
        await wait(30, "Waiting for deployment to stabilize");

        // Check initial deployment status
        console.log("📌 Checking initial deployment status...");
        let status = await k8.getDeploymentStatus(deploymentName);
        console.log(`Initial status: ${JSON.stringify(status, null, 2)}`);

        // Scale the deployment to 4 replicas
        console.log("📌 Scaling deployment to 4 replicas...");
        await k8.scaleDeployment(deploymentName, 4);
        await wait(30, "Waiting for scaling to complete");

        // Verify scaling
        console.log("📌 Verifying deployment status after scaling...");
        status = await k8.getDeploymentStatus(deploymentName);
        console.log(`Status after scaling: ${JSON.stringify(status, null, 2)}`);

        // List pods to confirm scaling
        console.log("📌 Listing deployment pods after scaling...");
        const pods = await k8.listDeploymentPods(deploymentName);
        console.table(pods);

        // Clean up the deployment
        console.log("🧹 Cleaning up: Deleting test deployment...");
        await k8.deleteDeployment(deploymentName);  // Add this method below
        await wait(10, "Confirming deployment deletion");
        console.log("✅ Test deployment deleted successfully");

        console.log("🎉 Test completed!");
    } catch (error) {
        console.error("❌ Test failed with error:", error);
        process.exit(1);
    }
})();
