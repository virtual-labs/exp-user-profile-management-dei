/**
 * ============================================
 * DEPLOYMENT MANAGER
 * ============================================
 * Manages one-click deployment of 5G network topology
 * 
 * Responsibilities:
 * - Deploy network functions one by one
 * - Create bus lines before NF deployment
 * - Auto-connect NFs to bus as they deploy
 * - Handle deployment timing (15 seconds per NF)
 */

class DeploymentManager {
    constructor() {
        this.isDeploying = false;
        this.deploymentQueue = [];
        this.currentDeploymentIndex = 0;
        this.deploymentTimer = null;
        
        console.log('✅ DeploymentManager initialized');
    }

    /**
     * Start one-click deployment from configuration
     * @param {Object} config - Deployment configuration from one-click.json
     */
    async startOneClickDeployment(config) {
        if (this.isDeploying) {
            alert('⚠️ Deployment already in progress!');
            return;
        }

        // Confirm deployment
        const totalNFs = config.nfs?.length || 0;
        const nfsToDeployCount = config.nfs?.filter(nf => nf.type !== 'UE' && nf.type !== 'gNB').length || 0;
        const confirmMsg = `🚀 ONE-CLICK DEPLOYMENT\n\n` +
            `This will deploy a complete 5G core network with:\n` +
            `• ${config.buses?.length || 0} Service Bus(es)\n` +
            `• ${nfsToDeployCount} Network Functions (excluding UE & gNB)\n` +
            `• ${config.connections?.length || 0} Connections\n\n` +
            `⏱️ Total Deployment Time: 15 seconds\n\n` +
            `📝 Note:\n` +
            `• UE and gNB are NOT included in deployment\n` +
            `• Add them manually after deployment\n` +
            `• This allows you to configure UE subscribers properly\n\n` +
            `The deployment will:\n` +
            `1. Create the Service Bus first\n` +
            `2. Deploy all core NFs one by one\n` +
            `3. Connect each NF to the bus as it deploys\n` +
            `4. Create manual connections\n\n` +
            `Continue with deployment?`;

        if (!confirm(confirmMsg)) {
            return;
        }

        console.log('🚀 Starting one-click deployment...');
        this.isDeploying = true;
        this.currentDeploymentIndex = 0;

        // IMPORTANT: Disable auto-connections during deployment
        if (window.nfManager) {
            window.nfManager.disableAutoConnections = true;
            console.log('🔒 Auto-connections disabled during deployment');
        }

        // Clear existing topology
        if (window.dataStore) {
            window.dataStore.clearAll();
        }

        // Clear logs
        if (window.logEngine) {
            window.logEngine.clearAllLogs();
        }

        // Log deployment start
        if (window.logEngine) {
            window.logEngine.addLog('system', 'SUCCESS',
                '🚀 One-Click Deployment Started', {
                totalNFs: config.nfs?.length || 0,
                totalBuses: config.buses?.length || 0,
                totalTime: '15 seconds',
                status: 'Deploying...'
            });
        }

        try {
            // Step 1: Create bus lines first (instant)
            await this.deployBuses(config.buses || []);

            // Step 2: Deploy NFs one by one over 15 seconds
            await this.deployNFsSequentially(config.nfs || [], config.busConnections || []);

            // Step 3: Create manual connections after deployment completes
            setTimeout(() => {
                this.createManualConnections(config.connections || []);
                
                // Re-enable auto-connections after deployment
                if (window.nfManager) {
                    window.nfManager.disableAutoConnections = false;
                    console.log('🔓 Auto-connections re-enabled after deployment');
                }
                
                this.completeDeployment();
            }, 1000);
        } catch (error) {
            console.error('❌ Deployment failed:', error);
            this.isDeploying = false;
            
            // Re-enable auto-connections on error
            if (window.nfManager) {
                window.nfManager.disableAutoConnections = false;
            }
            
            if (window.logEngine) {
                window.logEngine.addLog('system', 'ERROR',
                    'Deployment failed', {
                    error: error.message,
                    stack: error.stack
                });
            }
            
            alert('❌ Deployment failed: ' + error.message);
        }
    }

    /**
     * Deploy all bus lines
     * @param {Array} buses - Array of bus configurations
     */
    async deployBuses(buses) {
        console.log('🚌 Deploying bus lines...');

        for (const busConfig of buses) {
            if (window.busManager) {
                const bus = window.busManager.createBusLine(
                    busConfig.orientation,
                    busConfig.position,
                    busConfig.length,
                    busConfig.name
                );

                console.log(`✅ Bus deployed: ${bus.name}`);

                if (window.logEngine) {
                    window.logEngine.addLog('system', 'SUCCESS',
                        `Service Bus "${bus.name}" created`, {
                        orientation: bus.orientation,
                        length: `${bus.length}px`,
                        position: `(${bus.position.x}, ${bus.position.y})`
                    });
                }
            }
        }

        // Wait a bit for buses to render
        await this.sleep(1000);
    }

    /**
     * Deploy NFs one by one - entire process takes 15 seconds
     * @param {Array} nfs - Array of NF configurations
     * @param {Array} busConnections - Array of bus connection configurations
     */
    async deployNFsSequentially(nfs, busConnections) {
        // Filter out UE and gNB - these should be added manually by users
        const nfsToDeployFiltered = nfs.filter(nf => nf.type !== 'UE' && nf.type !== 'gNB');
        
        console.log(`📦 Deploying ${nfsToDeployFiltered.length} Network Functions over 15 seconds (excluding UE and gNB)...`);

        // Create a mapping of old IDs to new IDs
        this.idMapping = new Map();

        // Calculate delay between each NF deployment
        // Total time: 15 seconds, spread across all NFs
        const totalDeploymentTime = 15000; // 15 seconds in milliseconds
        const delayBetweenNFs = nfsToDeployFiltered.length > 1 ? totalDeploymentTime / (nfsToDeployFiltered.length - 1) : 0;

        console.log(`⏱️ Deploying ${nfsToDeployFiltered.length} NFs with ${Math.round(delayBetweenNFs)}ms between each`);

        for (let i = 0; i < nfsToDeployFiltered.length; i++) {
            const nfConfig = nfsToDeployFiltered[i];
            
            console.log(`\n🔄 Deploying NF ${i + 1}/${nfsToDeployFiltered.length}: ${nfConfig.name} (${nfConfig.type})`);

            if (window.logEngine) {
                window.logEngine.addLog('system', 'INFO',
                    `Deploying ${nfConfig.type} (${i + 1}/${nfsToDeployFiltered.length})...`, {
                    name: nfConfig.name,
                    ipAddress: nfConfig.config.ipAddress,
                    port: nfConfig.config.port,
                    progress: `${Math.round((i / nfsToDeployFiltered.length) * 100)}%`
                });
            }

            // Create the NF
            const nf = await this.deployNF(nfConfig);

            if (nf) {
                // Store ID mapping
                this.idMapping.set(nfConfig.id, nf.id);

                // Connect to bus if specified
                const busConnection = busConnections.find(bc => bc.nfId === nfConfig.id);
                if (busConnection && window.busManager) {
                    // Find the bus by name (since bus IDs will be different)
                    const allBuses = window.dataStore?.getAllBuses() || [];
                    const targetBus = allBuses.find(b => b.name === 'Service Bus');
                    
                    if (targetBus) {
                        window.busManager.connectNFToBus(nf.id, targetBus.id);
                        console.log(`✅ ${nf.name} connected to ${targetBus.name}`);
                    }
                }

                // Wait before deploying next NF (except for the last one)
                if (i < nfsToDeployFiltered.length - 1) {
                    const remainingTime = Math.round(delayBetweenNFs / 1000 * 10) / 10;
                    console.log(`⏳ Waiting ${remainingTime}s before next deployment...`);
                    await this.sleep(delayBetweenNFs);
                }
            }
        }

        console.log('✅ All NFs deployed successfully in 15 seconds (UE and gNB excluded - add manually)');
        
        if (window.logEngine) {
            window.logEngine.addLog('system', 'INFO',
                '📝 Note: UE and gNB not deployed - add them manually as needed', {
                reason: 'UE requires manual subscriber configuration',
                instruction: 'Use "Add NF" button to add UE and gNB'
            });
        }
    }

    /**
     * Deploy a single NF
     * @param {Object} nfConfig - NF configuration
     * @returns {Object} Created NF
     */
    async deployNF(nfConfig) {
        if (!window.nfManager) {
            console.error('❌ NFManager not available');
            return null;
        }

        // Create NF with position from config
        const nf = window.nfManager.createNetworkFunction(
            nfConfig.type,
            nfConfig.position
        );

        if (!nf) {
            console.error(`❌ Failed to create ${nfConfig.type}`);
            return null;
        }

        // Update NF with config values
        nf.config.ipAddress = nfConfig.config.ipAddress;
        nf.config.port = nfConfig.config.port;
        nf.config.httpProtocol = nfConfig.config.httpProtocol || 'HTTP/2';

        // Copy additional config properties
        if (nfConfig.config.tun0Interface) {
            nf.config.tun0Interface = { ...nfConfig.config.tun0Interface };
        }
        if (nfConfig.config.subscriberImsi) {
            nf.config.subscriberImsi = nfConfig.config.subscriberImsi;
            nf.config.subscriberKey = nfConfig.config.subscriberKey;
            nf.config.subscriberOpc = nfConfig.config.subscriberOpc;
            nf.config.subscriberDnn = nfConfig.config.subscriberDnn;
            nf.config.subscriberSst = nfConfig.config.subscriberSst;
        }

        // Update in data store
        if (window.dataStore) {
            window.dataStore.updateNF(nf.id, nf);
        }

        console.log(`✅ ${nf.name} deployed at ${nf.config.ipAddress}:${nf.config.port}`);

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }

        return nf;
    }

    /**
     * Create manual connections between NFs
     * @param {Array} connections - Array of connection configurations
     */
    createManualConnections(connections) {
        console.log(`🔗 Creating ${connections.length} manual connections...`);

        // Get all deployed NFs
        const allNFs = window.dataStore?.getAllNFs() || [];

        connections.forEach(connConfig => {
            // Use ID mapping to find the new IDs
            const newSourceId = this.idMapping.get(connConfig.sourceId);
            const newTargetId = this.idMapping.get(connConfig.targetId);

            const sourceNF = allNFs.find(nf => nf.id === newSourceId);
            const targetNF = allNFs.find(nf => nf.id === newTargetId);

            if (sourceNF && targetNF && window.connectionManager) {
                const connection = window.connectionManager.createManualConnection(
                    sourceNF.id,
                    targetNF.id
                );

                if (connection) {
                    console.log(`✅ Connection created: ${sourceNF.name} → ${targetNF.name} (${connConfig.interfaceName})`);
                    
                    if (window.logEngine) {
                        window.logEngine.addLog('system', 'SUCCESS',
                            `Connection established: ${sourceNF.name} → ${targetNF.name}`, {
                            interface: connConfig.interfaceName,
                            protocol: connConfig.protocol
                        });
                    }
                }
            }
        });
    }

    /**
     * Complete deployment
     */
    completeDeployment() {
        this.isDeploying = false;
        this.currentDeploymentIndex = 0;

        console.log('✅ One-click deployment completed!');

        if (window.logEngine) {
            window.logEngine.addLog('system', 'SUCCESS',
                '✅ One-Click Deployment Completed Successfully', {
                status: 'All network functions deployed and connected',
                timestamp: new Date().toISOString(),
                totalNFs: window.dataStore?.getAllNFs().length || 0,
                totalConnections: window.dataStore?.getAllConnections().length || 0,
                totalBuses: window.dataStore?.getAllBuses().length || 0
            });
        }

        // Show completion message
        const allNFs = window.dataStore?.getAllNFs() || [];
        const allConnections = window.dataStore?.getAllConnections() || [];
        const allBuses = window.dataStore?.getAllBuses() || [];

        const completionMsg = `✅ DEPLOYMENT COMPLETE!\n\n` +
            `Your 5G network is now fully deployed and operational.\n\n` +
            `📊 Deployment Summary:\n` +
            `• Network Functions: ${allNFs.length}\n` +
            `• Service Buses: ${allBuses.length}\n` +
            `• Connections: ${allConnections.length}\n\n` +
            `All NFs are connected and ready to process traffic.`;

        alert(completionMsg);
    }

    /**
     * Cancel ongoing deployment
     */
    cancelDeployment() {
        if (!this.isDeploying) {
            return;
        }

        if (confirm('⚠️ Cancel deployment?\n\nThis will stop the deployment process.')) {
            this.isDeploying = false;
            this.currentDeploymentIndex = 0;

            if (this.deploymentTimer) {
                clearTimeout(this.deploymentTimer);
                this.deploymentTimer = null;
            }

            console.log('❌ Deployment cancelled');

            if (window.logEngine) {
                window.logEngine.addLog('system', 'WARNING',
                    'Deployment cancelled by user', {
                    deployedNFs: this.currentDeploymentIndex,
                    status: 'Partial deployment'
                });
            }
        }
    }

    /**
     * Sleep utility
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Load deployment configuration from file
     * @returns {Promise<Object>} Deployment configuration
     */
    async loadDeploymentConfig() {
        try {
            const response = await fetch('../one-click.json');
            const config = await response.json();
            console.log('✅ Deployment configuration loaded');
            return config;
        } catch (error) {
            console.error('❌ Failed to load deployment configuration:', error);
            alert('Failed to load deployment configuration file (one-click.json)');
            return null;
        }
    }
}
