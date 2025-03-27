import { kubernetesManager } from './k8s.js';
import * as k8s from '@kubernetes/client-node';

// Utility function for controlled waiting with a message
const wait = async (seconds: number, message: string) => {
    console.log(`⏱️ ${message} (waiting ${seconds}s)...`);
    await new Promise(r => setTimeout(r, seconds * 1000));
    console.log(`✓ Done waiting ${seconds}s`);
};

// Main execution function
(async () => {
    try {
        console.log("🚀 Starting Kubernetes test with improved metrics handling");
        const k8 = new kubernetesManager();

        // List all namespaces
        console.log("📌 Listing Namespaces...");
        const namespaces = await k8.listNamespaces();
        console.log(`Found ${namespaces.length} namespaces: ${namespaces.join(', ')}`);

        const label = "app=nginx";
        const podName = "test-nginx";

        // Check for existing pods
        console.log(`📌 Checking for existing pods with label "${label}"...`);
        const existingCount = await k8.getPodWithLabel(label);
        console.log(`Found ${existingCount} pod(s) with label ${label}`);

        // Delete existing pod if found
        if (existingCount > 0) {
            console.log(`⚠️ Pod "${podName}" already exists. Deleting...`);
            await k8.deletePod(podName);
            await wait(10, "Waiting for pod deletion to complete");

            // Verify deletion
            const countAfterDelete = await k8.getPodWithLabel(label);
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

        // Wait longer for pod to become ready
        await wait(30, "Waiting for pod to start and become ready");

        // Add a check for pod readiness before checking metrics
        console.log("🔍 Verifying pod is in Running state...");
        // Implement k8.getPodStatus or similar function to check pod status
        // const status = await k8.getPodStatus(podName);
        // console.log(`Current pod status: ${status}`);

        // Retry logic with exponential backoff
        let usage: any = [];
        let attempts = 5;
        let waitTime = 10; // Start with 10 seconds wait

        while (attempts-- > 0 && usage.length === 0) {
            console.log(`📈 Fetching pod resource usage (attempt ${5 - attempts}/5)...`);
            usage = await k8.topPods(label);

            if (usage.length === 0) {
                console.log(`ℹ️ No metrics available yet, backing off...`);
                await wait(waitTime, `Waiting before next metrics attempt`);
                waitTime = Math.min(waitTime * 2, 60); // Exponential backoff with max 60s
            }
        }

        // Process and display the results
        if (usage.length > 0) {
            console.log("✅ Pod resource usage successfully retrieved:");
            console.table(usage);
        } else {
            console.warn("⚠️ No resource usage data available after multiple attempts.");
            console.log("👉 You might want to check if metrics-server is properly installed in your cluster");
            console.log("👉 Try running: kubectl top pod -n <namespace>");
        }

        // Clean up the pod
        console.log("🧹 Cleaning up: Deleting test pod...");
        await k8.deletePod(podName);
        await wait(5, "Confirming pod deletion");
        console.log("✅ Test pod deleted successfully");

        console.log("🎉 Test completed!");
    } catch (error) {
        console.error("❌ Test failed with error:", error);
        process.exit(1);
    }
})();