import * as k8s from "@kubernetes/client-node";

interface PodResourceUsage {
    name: string;
    cpu: string;
    memory: string;
}

export class kubernetesManager {
    private k8Api: k8s.CoreV1Api;
    private k8appApi: k8s.AppsV1Api;
    private metricApi: k8s.CustomObjectsApi;
    private namespace = "default";

    constructor() {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        this.k8Api = kc.makeApiClient(k8s.CoreV1Api);
        this.k8appApi = kc.makeApiClient(k8s.AppsV1Api);
        this.metricApi = kc.makeApiClient(k8s.CustomObjectsApi);
    }

    async listNamespaces(): Promise<string[]> {
        const res: k8s.V1NamespaceList = await this.k8Api.listNamespace();
        return res.items
            .map((item) => item?.metadata?.name)
            .filter((name): name is string => name !== undefined);
    }

    async getPodWithLabel(label: string): Promise<number> {
        const res: k8s.V1PodList = await this.k8Api.listNamespacedPod(
            {
                namespace: this.namespace,
                labelSelector: label
            }
        );
        return res.items.length;
    }

    async createPod(pod: k8s.V1Pod): Promise<k8s.V1Pod> {
        const res = await this.k8Api.createNamespacedPod({ namespace: this.namespace, body: pod });
        return res;
    }

    async deletePod(podName: string): Promise<k8s.V1Pod> {
        const res = await this.k8Api.deleteNamespacedPod({ name: podName, namespace: this.namespace })
        return res;
    }
    async topPods(label: string): Promise<PodResourceUsage[]> {
        const pods = await this.k8Api.listNamespacedPod(
            {
                namespace: this.namespace,

                labelSelector: label
            }
        );

        const podNames = pods.items
            .map(pod => pod?.metadata?.name)
            .filter((name): name is string => !!name);

        console.log(podNames);

        if (podNames.length === 0) {
            console.log("No pods found with label:", label);
            return [];
        }

        let metricsRes;
        try {
            metricsRes = await this.metricApi.listNamespacedCustomObject({
                group: 'metrics.k8s.io',
                version: 'v1beta1',
                namespace: this.namespace,
                plural: 'pods',
                labelSelector: label
            });

            console.log("Metrics response:", JSON.stringify(metricsRes, null, 2));

        } catch (err) {
            console.error("❌ Failed to fetch metrics:", err);
            return [];
        }

        console.log(metricsRes)
        const metrics = metricsRes?.items || [];
        console.log(metrics)
        if (metrics.length === 0) {
            return podNames.map(name => ({
                name,
                cpu: "pending",
                memory: "pending"
            }));
        }
        const usage: PodResourceUsage[] = [];

        for (const podMetric of metrics) {
            const podName = podMetric?.metadata?.name;
            if (!podName || !podNames.includes(podName)) continue;

            let cpu = "0";
            let memory = "0";

            if (podMetric.containers && podMetric.containers.length > 0) {
                for (const container of podMetric.containers) {
                    if (container.usage) {
                        cpu = container.usage.cpu || cpu;
                        memory = container.usage.memory || memory;
                    }
                }
            }

            usage.push({ name: podName, cpu, memory });
        }
        return usage;
    }

    async scaleDeployment(name: string, replicas: number): Promise<void> {
        try {
            const patch = { spec: { replicas } };
            const patchResponse = await this.k8appApi.patchNamespacedDeployment({ name: name, namespace: this.namespace, body: patch })
            console.log('Scaling succeeded. Patch response:', patchResponse);
        } catch (error) {
            console.error('failed to scaled');
        }
    }

    async getDeploymentStatus(name: string): Promise<{ name: string, replicas: number, availableReplicas: number, readyReplicas: number; }> {
        try {
            const response: k8s.V1Deployment = await this.k8appApi.readNamespacedDeployment({ name: name, namespace: this.namespace });
            return {
                name: response?.metadata?.name || "undefined",
                replicas: response.spec?.replicas || 0,
                availableReplicas: response.status?.availableReplicas || 0,
                readyReplicas: response.status?.readyReplicas || 0
            }

        } catch (error) {
            console.error("error while getting deployment status")
            return {
                name: "undefined",
                replicas: 0,
                availableReplicas: 0,
                readyReplicas: 0
            }
        }
    }
    async listDeploymentPods(deploymentName: string): Promise<Array<{ name: string, status: string, restarts: number, age: string }>> {
        try {
            const labelSelector = `app=${deploymentName}`
            const res = await this.k8Api.listNamespacedPod({ namespace: this.namespace, labelSelector: labelSelector })
            return res.items.map(pod => {
                const containerStatus: k8s.V1ContainerStatus[] = pod?.status?.containerStatuses || [];
                const restarts = containerStatus.reduce((sum: number, status) => sum + (status.restartCount || 0), 0)
                const creationTimestamp = pod.metadata?.creationTimestamp;
                const age = creationTimestamp ? this.calculateAge(new Date(creationTimestamp)) : 'unknown'
                return {
                    name: pod.metadata?.name || 'unknown',
                    status: pod.status?.phase || 'unknown',
                    restarts,
                    age
                }
            })
        } catch (err) {
            console.error('failed to list deployments')
            throw err;
        }
    }
    private calculateAge(creationTime: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - creationTime.getTime();

        const seconds = Math.floor(diffMs / 1000);
        if (seconds < 60) return `${seconds}s`;

        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;

        const days = Math.floor(hours / 24);
        return `${days}d`;
    }
}
