## Step 1: Deploy Core Network

**Option A (Terminal):**
Click on the **Terminal button** to open the terminal then from the project root directory, execute the following command:

```bash
docker compose -f docker-compose.yml up -d
```

This command brings up all the core 5G network components — including AMF, SMF, UPF, NRF, and others — in detached mode. Running it in detached mode means all containers start quietly in the background, so your terminal stays free and you don't have to keep a session open just to keep things running.

<img src="images/prd1.png" width="90%">

*Fig: Terminal output showing core network deployment with docker compose*

### Once the core network is up and running, deploy the gNB services:

```bash
docker compose -f docker-compose-gnb.yml up -d
```

This spins up the gNB (next-generation NodeB), which acts as the 5G radio access point. Once it's up, it automatically reaches out and registers itself with the core network, so the two sides are connected and ready to handle UE traffic.

<img src="images/prd2.png" width="90%">

*Fig: Terminal output showing gNB deployment and connection to core network*

### After the gNB deployment is complete, deploy the UE services:

```bash
docker compose -f docker-compose-ue.yml up -d
```

This starts the UE (User Equipment) containers and attaches them to the gNB. Think of this as simulating the actual devices — phones, IoT sensors, etc. — that connect to your 5G network. Once attached, they'll go through the full registration and session setup flow.

<img src="images/prd3.png" width="90%">

*Fig: Terminal output showing UE deployment and attachment to gNB*

<img src="images/prd4.png" width="90%">

*Fig: Complete 5G network topology with UE, gNB, and all core network functions running*


### To verify that all containers are running successfully, execute:

```bash
docker ps
```

A quick sanity check. This lists all currently running Docker containers along with their status, ports, and names. If everything deployed correctly, you should see all your core network, gNB, and UE containers showing a healthy `Up` status here.

<img src="images/prd5.png" width="90%">

*Fig: Docker PS output listing all running 5G network containers with their status*

### To continuously monitor the status of the core network containers, use:

```bash
watch docker compose -f docker-compose.yml ps -a
```

This keeps a live, auto-refreshing view of all your core network containers. It's handy when you want to watch the network stabilize after deployment or catch any container that unexpectedly exits. The `-a` flag ensures you see all containers, including ones that may have stopped.

<img src="images/prd6.png" width="90%">

*Fig: Continuous real-time monitoring of core network container status*

## Option B: Manual Deployment

1. Add each required Network Function (NF) individually from the Network Function Panel.
2. Provide the necessary configuration parameters in the Configuration Panel on the left.
3. Start each Network Function after configuration.
4. Repeat the above steps until all required Network Functions are successfully deployed and running.

This approach gives you full control over each Network Function. It's useful when you want to deploy only specific components, tweak individual configurations, or troubleshoot a particular NF without touching the rest of the network.

<img src="images/prd7.png" width="90%">

*Fig: Manual deployment of individual network functions via the Network Function Panel*

## Option C: Automatic Deployment (Recommended)

1. Click the One-Click Deploy button on the top toolbar.
2. Confirm the deployment when prompted.

This is the fastest way to get a full 5G core up and running. The system handles everything for you — clearing old topology, deploying components in the right order, and wiring up all the connections. Great for demos, fresh environments, or when you just want things to work without the manual steps.

<img src="images/prd8.png" width="90%">

*Fig: One-click automatic deployment of the complete 5G core network topology*

### Observation:

- The system automatically clears any existing topology.
- The Service Bus is deployed first.
- All Network Functions (NRF, AMF, SMF, UPF, AUSF, UDM, PCF, NSSF, UDR) are deployed sequentially.
- Required interconnections are established automatically.
- Network Functions appear one by one on the topology view during deployment.

## Step 2: gNB Deployment

1. Select the gNB from the available components.
2. Enter a valid IP address and port number in the configuration panel.
3. Deploy and start the gNB.

The gNB is the bridge between your UEs and the 5G core. Make sure the IP and port you enter here match what your core network expects — a mismatch here is one of the most common reasons the gNB fails to register with the AMF.

<img src="images/prd9.png" width="90%">

*Fig: gNB deployment with IP address and port configuration*

## Step 3: Verify UE Details in UDR

1. Select the UDR Network Function.
2. Click on Show Subscriber Info.
3. The system displays the list and quantity of registered UEs.
4. Select the UE you want to modify and click the Edit button.

Before a UE can connect, its subscription data needs to exist in the UDR (Unified Data Repository). This step lets you confirm that your UEs are already registered and gives you a chance to review or update their details before bringing them online.

<img src="images/prd10.png" width="90%">

*Fig: UDR subscriber info panel showing list of registered UEs*

## Step 4: Modify UE Subscription Details

1. Update the required UE parameters.
   - For example, change the DNN from 5G-LAB to internet.
2. Save the updated configuration.
3. A notification is displayed confirming that the changes have been saved successfully.

This is where you fine-tune how a UE behaves on the network. The DNN (Data Network Name) essentially tells the core which data network to route the UE's traffic through — so if you're testing internet connectivity, make sure it's set to `internet` here before starting the UE.

<img src="images/prd11.png" width="90%">

*Fig: UE subscription details updated with new DNN configuration*

## Step 5: Update and Start UE

1. Select the UE component.
2. Enter the UE configuration details exactly as updated in the UDR database.
3. Ensure all modified parameters are correctly reflected.
4. Start the UE.
5. Verify that the UE registers and operates successfully within the network.

This is the final step — actually bringing the UE online. The configuration you enter here must match what's stored in the UDR exactly, otherwise the authentication and registration will fail. Once started, a successfully registered UE will show an active PDU session, confirming it's connected and passing traffic through the 5G core.

<img src="images/prd12.png" width="90%">

*Fig: UE successfully registered and connected to the 5G core network*
