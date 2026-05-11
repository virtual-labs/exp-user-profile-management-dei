/***
 * ============================================
 * DOCKER TERMINAL MANAGER
 * ============================================
 * Manages Docker terminal functionality for managing Network Functions
 * 
 * Responsibilities:
 * - Docker compose commands (up, down, ps)
 * - Start/stop individual NFs
 * - Display service status with health indicators
 * - Watch mode for real-time status updates
 * 
 * ============================================
 * STANDARDIZED TERMINAL FEATURES
 * ============================================
 * This implementation includes standardized UI patterns that can be
 * reused across other simulation components:
 * 
 * 1. AUTOCOMPLETE LOGIC (Tab Key)
 *    - Uses Longest Common Prefix (LCP) algorithm
 *    - Single match: Auto-completes fully
 *    - Multiple matches: Extends to LCP, then shows all options
 *    - No matches: Visual feedback (opacity flicker)
 *    - Multi-column grid display for options
 *    - See: Tab key handler in setupTerminal()
 * 
 * 2. SIMPLIFIED WINDOW CONTROLS
 *    - Only Close button (×) in title bar
 *    - No minimize/maximize buttons
 *    - No dragging or resizing
 *    - Fixed centered modal overlay
 *    - See: openTerminal()
 * 
 * 3. VI MODE - FULL NAVIGATION
 *    Exit Commands:
 *    - Press 'q' for quick exit (like less/more pagers)
 *    - Press ':q', ':q!', ':wq' for vi-style exit
 *    - Press 'Escape' to exit or clear command buffer
 *    
 *    Navigation Keys:
 *    - 'j' / 'k' → Scroll line by line
 *    - 'f' / 'b' → Scroll page by page
 *    - 'G' → Go to bottom
 *    - 'gg' → Go to top (press 'g' twice)
 *    - Arrow keys, PageUp/PageDown supported
 *    
 *    All keystrokes prevented from reaching terminal
 *    Uses event capture phase for proper isolation
 *    See: enterViMode(), viKeyHandler
 * 
 * 4. KEYBOARD SHORTCUTS
 *    - Ctrl+C → Interrupt/Stop watch mode
 *    - Ctrl+L → Clear screen
 *    - Arrow Up/Down → Command history navigation
 *    - Enter → Execute command
 *    - Tab → Autocomplete with LCP
 * 
 * 5. CLEAN OUTPUT
 *    - No extra blank lines after commands
 *    - Professional spacing like real terminals
 *    - Color-coded output (Success/Warning/Error/Info)
 */

class DockerTerminal {
    constructor() {
        this.watchInterval = null;
        this.isWatching = false;
        this.dockerServices = new Map(); // Map of service name to status

        // Terminal window state
        this.terminalState = {
            x: null,
            y: null,
            width: 900,
            height: 700,
            isMaximized: false,
            isMinimized: false
        };

        // Network state
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopNetworkId = this.generateNetworkId();
        this.oaiWorkshopCreatedTime = null;

        // Cache for one-click.json topology
        this.oneClickTopology = null;
        this.topologyLoadPromise = null;

        console.log('✅ DockerTerminal initialized');
    }

    /**
     * Initialize Docker terminal button
     */
    init() {
        // Button is added in HTML, just setup click handler if needed
        console.log('✅ Docker terminal ready');
    }

    /**
     * Load one-click.json topology (cached)
     * @returns {Promise<Object>} Topology object
     */
    async loadOneClickTopology() {
        // Return cached topology if available
        if (this.oneClickTopology) {
            return this.oneClickTopology;
        }

        // If already loading, return the existing promise
        if (this.topologyLoadPromise) {
            return this.topologyLoadPromise;
        }

        // Start loading
        this.topologyLoadPromise = (async () => {
            try {
                const response = await fetch('../one-click.json');
                if (!response.ok) {
                    throw new Error(`Failed to load one-click.json: ${response.statusText}`);
                }
                this.oneClickTopology = await response.json();
                console.log('✅ Loaded one-click.json topology');
                return this.oneClickTopology;
            } catch (error) {
                console.warn('⚠️ Could not load one-click.json:', error);
                this.oneClickTopology = null;
                return null;
            } finally {
                this.topologyLoadPromise = null;
            }
        })();

        return this.topologyLoadPromise;
    }

    /**
     * Get position for NF type from one-click.json
     * @param {string} nfType - NF type (e.g., 'NRF', 'AMF')
     * @returns {Object|null} Position {x, y} or null if not found
     */
    async getPositionFromOneClick(nfType) {
        const topology = await this.loadOneClickTopology();
        if (!topology || !topology.nfs) {
            return null;
        }

        const nf = topology.nfs.find(n => n.type === nfType);
        if (nf && nf.position) {
            return { x: nf.position.x, y: nf.position.y };
        }

        return null;
    }

    /**
     * Auto-connect NF to buses based on one-click.json
     * @param {Object} nf - Network Function object
     */
    async autoConnectToBusesFromOneClick(nf) {
        if (!nf || !window.busManager || !window.dataStore) {
            return;
        }

        const topology = await this.loadOneClickTopology();
        if (!topology || !topology.buses || !topology.busConnections) {
            return;
        }

        // Find bus connections for this NF type in one-click.json
        const nfFromTopology = topology.nfs.find(n => n.type === nf.type);
        if (!nfFromTopology) {
            return;
        }

        // Find all bus connections for this NF in topology
        const busConnections = topology.busConnections.filter(bc => {
            // Match by NF type (since IDs will be different)
            const connectedNF = topology.nfs.find(n => n.id === bc.nfId);
            return connectedNF && connectedNF.type === nf.type;
        });

        // Connect to each bus
        for (const busConn of busConnections) {
            const busFromTopology = topology.buses.find(b => b.id === busConn.busId);
            if (!busFromTopology) {
                continue;
            }

            // Find or create the bus in current dataStore
            let bus = window.dataStore.getAllBuses().find(b => b.name === busFromTopology.name);
            
            // If bus doesn't exist, create it from one-click.json
            if (!bus && window.busManager) {
                bus = window.busManager.createBusLine(
                    busFromTopology.orientation || 'horizontal',
                    busFromTopology.position || null,
                    busFromTopology.length || 600,
                    busFromTopology.name
                );
                
                if (bus) {
                    // Set bus color if available
                    if (busFromTopology.color) {
                        bus.color = busFromTopology.color;
                    }
                    console.log(`🚌 Created bus ${bus.name} from one-click.json`);
                }
            }

            if (bus) {
                // Check if already connected
                const existingConnection = window.dataStore.getAllBusConnections().find(
                    bc => bc.nfId === nf.id && bc.busId === bus.id
                );
                
                if (!existingConnection) {
                    // Connect NF to bus
                    const connection = window.busManager.connectNFToBus(nf.id, bus.id);
                    if (connection) {
                        console.log(`🔗 Auto-connected ${nf.name} to ${bus.name} (from one-click.json)`);
                        
                        if (window.logEngine) {
                            window.logEngine.addLog(nf.id, 'INFO', 
                                `Auto-connected to ${bus.name} service bus (from one-click.json)`, {
                                busId: bus.id,
                                interfaceName: connection.interfaceName,
                                autoConnect: true
                            });
                        }
                    }
                }
            }
        }
    }

    /**
     * Open Docker terminal modal - Realistic Terminal Style
     */
    openTerminal() {
        // Remove existing terminal if any
        const existingTerminal = document.getElementById('docker-terminal-modal');
        if (existingTerminal) {
            existingTerminal.remove();
        }

        // Create terminal modal
        const terminalModal = document.createElement('div');
        terminalModal.id = 'docker-terminal-modal';
        terminalModal.className = 'docker-terminal-modal';
        terminalModal.innerHTML = `
            <div class="docker-terminal-window" id="docker-terminal-window">
                <div class="docker-terminal-resize-handle" data-dir="n"></div>
                <div class="docker-terminal-resize-handle" data-dir="s"></div>
                <div class="docker-terminal-resize-handle" data-dir="e"></div>
                <div class="docker-terminal-resize-handle" data-dir="w"></div>
                <div class="docker-terminal-resize-handle" data-dir="ne"></div>
                <div class="docker-terminal-resize-handle" data-dir="nw"></div>
                <div class="docker-terminal-resize-handle" data-dir="se"></div>
                <div class="docker-terminal-resize-handle" data-dir="sw"></div>
                <div class="docker-terminal-inner">
                    <div class="docker-terminal-titlebar" id="docker-terminal-titlebar">
                        <div class="docker-terminal-title">
                            <span class="docker-terminal-icon">🐳</span>
                            Docker Terminal
                        </div>
                        <div class="docker-terminal-controls">
                            <button class="docker-terminal-btn close" id="docker-terminal-close" title="Close">×</button>
                        </div>
                    </div>
                    <div class="docker-terminal-content" id="docker-terminal-content">
                        <div class="docker-terminal-output" id="docker-terminal-output"></div>
                        <div class="docker-terminal-input-line" id="docker-terminal-input-line">
                            <span class="docker-terminal-prompt">docker@main></span>
                            <span id="docker-terminal-input" class="docker-terminal-input" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" role="textbox" aria-label="Terminal input"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(terminalModal);

        // Setup terminal functionality
        this.setupTerminal(terminalModal);

        // Setup dragging, resizing, and window controls
        this.setupWindowControls(terminalModal);

        // Apply saved position and size
        this.applyTerminalState();

        // GLOBAL FALLBACK: Add document-level Ctrl+C handler
        const globalCtrlCHandler = (e) => {
            const isCtrlC = (e.ctrlKey || e.metaKey) && 
                           (e.key === 'c' || e.key === 'C' || e.keyCode === 67 || e.which === 67);
            
            if (isCtrlC && this.isWatching) {
                console.log('🔴 GLOBAL HANDLER: Ctrl+C detected!', {
                    key: e.key,
                    keyCode: e.keyCode,
                    which: e.which,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    isWatching: this.isWatching
                });
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.stopWatch();
                const output = document.getElementById('docker-terminal-output');
                if (output) {
                    this.addTerminalLine(output, '^C', 'info');
                }
                return false;
            }
        };
        
        // Add to document with capture phase
        document.addEventListener('keydown', globalCtrlCHandler, true);
        
        // Clean up when terminal closes
        const originalRemove = terminalModal.remove.bind(terminalModal);
        terminalModal.remove = () => {
            document.removeEventListener('keydown', globalCtrlCHandler, true);
            originalRemove();
        };

        // Show terminal with animation
        setTimeout(() => {
            terminalModal.classList.add('show');
        }, 10);

        // Focus on input and scroll to bottom
        const input = document.getElementById('docker-terminal-input');
        const content = document.getElementById('docker-terminal-content');
        if (input) {
            input.focus();
        }
        if (content) {
            content.scrollTop = content.scrollHeight;
        }
    }

    /**
     * Setup Docker terminal functionality - Realistic Terminal
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupTerminal(terminalModal) {
        const output = document.getElementById('docker-terminal-output');
        const content = document.getElementById('docker-terminal-content');
        const closeBtn = document.getElementById('docker-terminal-close');

        let commandHistory = [];
        let historyIndex = -1;

        // Tab completion state
        let tab = null;

        const commands = [
            // Simple commands
            'help', 'status', 'check', 'clear', 'cls', 'exit', 'ls',
            // vi - only docker-compose.yml
            'vi docker-compose.yml',
            // docker plain
            'docker ps',
            'docker network ls',
            'docker network inspect ',
            'docker version',
            'docker start ',
            'docker stop ',
            // docker compose (space form) — core
            'docker compose up -d',
            'docker compose down',
            'docker compose -f docker-compose.yml up -d',
            'docker compose -f docker-compose.yml up -d ',   // trailing space → service name follows
            'docker compose -f docker-compose.yml down',
            'docker compose -f docker-compose.yml down ',    // trailing space → service name follows
            // docker compose — gnb
            'docker compose -f docker-compose-gnb.yml up -d',
            'docker compose -f docker-compose-gnb.yml down',
            // docker compose — ue
            'docker compose -f docker-compose-ue.yml up -d',
            'docker compose -f docker-compose-ue.yml down',
            // docker compose — ran (individual UEs)
            'docker compose -f docker-compose-ran.yml up -d oai-ue1',
            'docker compose -f docker-compose-ran.yml up -d oai-ue2',
            // watch
            'watch docker compose ps -a',
            'watch docker compose -f docker-compose.yml ps -a',
        ];

        // Helper: write text to input, always fetching fresh reference
        const writeInput = (text) => {
            const inp = document.getElementById('docker-terminal-input');
            if (!inp) return;
            inp.innerHTML = '';
            inp.appendChild(document.createTextNode(text));
            moveCursorToEnd(inp);
        };

        // Helper: move cursor to end of contentEditable element
        const moveCursorToEnd = (el) => {
            el.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        };

        // Close button
        closeBtn.addEventListener('click', () => {
            this.stopWatch();
            terminalModal.classList.remove('show');
            setTimeout(() => {
                terminalModal.remove();
            }, 300);
        });

        // Click outside to close
        terminalModal.addEventListener('click', (e) => {
            if (e.target === terminalModal) {
                closeBtn.click();
            }
        });

        // Keep focus on input when clicking in terminal
        content.addEventListener('click', (e) => {
            const inp = document.getElementById('docker-terminal-input');
            if (inp && e.target !== inp) {
                inp.focus();
            }
        });

        // Scroll to bottom helper
        const scrollToBottom = () => {
            if (content) {
                content.scrollTop = content.scrollHeight;
            }
        };

        // CAPTURE PHASE: Catch Ctrl+C before any other handlers
        // This uses the capture phase (third parameter = true) to intercept the event early
        terminalModal.addEventListener('keydown', (e) => {
            // Check multiple ways to detect Ctrl+C
            const isCtrlC = (e.ctrlKey || e.metaKey) && 
                           (e.key === 'c' || e.key === 'C' || e.keyCode === 67 || e.which === 67);
            
            if (isCtrlC && this.isWatching) {
                console.log('🔴 CAPTURE PHASE: Ctrl+C detected!', {
                    key: e.key,
                    keyCode: e.keyCode,
                    which: e.which,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    isWatching: this.isWatching
                });
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                this.stopWatch();
                this.addTerminalLine(output, '^C', 'info');
                requestAnimationFrame(() => {
                    scrollToBottom();
                    document.getElementById('docker-terminal-input')?.focus();
                });
                return false; // Extra safety
            }
        }, true); // true = capture phase

        // Input handling — attach to document so it still works after input line is recreated
        terminalModal.addEventListener('keydown', async (e) => {
            // PRIORITY: Handle Ctrl+C first, before anything else
            // Check multiple ways to detect Ctrl+C
            const isCtrlC = (e.ctrlKey || e.metaKey) && 
                           (e.key === 'c' || e.key === 'C' || e.keyCode === 67 || e.which === 67);
            
            if (isCtrlC) {
                if (this.isWatching) {
                    console.log('🔴 BUBBLE PHASE: Ctrl+C detected!', {
                        key: e.key,
                        keyCode: e.keyCode,
                        which: e.which,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                        isWatching: this.isWatching
                    });
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    this.stopWatch();
                    this.addTerminalLine(output, '^C', 'info');
                    // stopWatch restores the input line; scroll after reflow
                    requestAnimationFrame(() => {
                        scrollToBottom();
                        document.getElementById('docker-terminal-input')?.focus();
                    });
                    return false; // Extra safety
                }
            }

            // Ignore if in vi mode (vi handler will handle it)
            if (this.isInViMode) {
                return;
            }

            // Handle Ctrl+L to clear screen
            if (e.ctrlKey && e.key === 'l') {
                e.preventDefault();
                output.innerHTML = '';
                scrollToBottom();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                tab = null;
                const inp = document.getElementById('docker-terminal-input');
                const command = inp ? inp.textContent.trim() : '';
                if (command) {
                    commandHistory.push(command);
                    historyIndex = commandHistory.length;
                    this.addTerminalLine(output, `docker@main> ${command}`, 'command');
                    writeInput('');
                    // Hide input line while command is running
                    const inputLine = document.getElementById('docker-terminal-input-line');
                    if (inputLine) inputLine.style.display = 'none';
                    await this.processCommand(command, output);
                    // Restore input line after command finishes (unless watch mode took over)
                    if (!this.isWatching) {
                        const inputLineAfter = document.getElementById('docker-terminal-input-line');
                        if (inputLineAfter) inputLineAfter.style.display = 'flex';
                        scrollToBottom();
                        document.getElementById('docker-terminal-input')?.focus();
                    }
                } else {
                    this.addTerminalLine(output, 'docker@main>', 'command');
                    scrollToBottom();
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                tab = null;
                if (historyIndex > 0) {
                    historyIndex--;
                    writeInput(commandHistory[historyIndex]);
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                tab = null;
                if (historyIndex < commandHistory.length - 1) {
                    historyIndex++;
                    writeInput(commandHistory[historyIndex]);
                } else {
                    historyIndex = commandHistory.length;
                    writeInput('');
                }
            } else if (e.key === 'Tab') {
                e.preventDefault();

                // Cycle through stored options if tab is already active
                if (tab && tab.active) {
                    tab.index = (tab.index + 1) % tab.options.length;
                    writeInput(tab.base + tab.options[tab.index] + ' ');
                    return;
                }

                // Fresh tab press — read raw text preserving trailing spaces
                const inp = document.getElementById('docker-terminal-input');
                if (!inp) return;
                const raw = inp.textContent; // no trim — preserve trailing space

                // Determine base and partial word
                let base, partial;
                if (raw.endsWith(' ')) {
                    base = raw;
                    partial = '';
                } else {
                    const lastSpace = raw.lastIndexOf(' ');
                    if (lastSpace === -1) {
                        base = '';
                        partial = raw;
                    } else {
                        base = raw.slice(0, lastSpace + 1);
                        partial = raw.slice(lastSpace + 1);
                    }
                }

                // Filter commands that start with the full typed text (base)
                const filtered = commands.filter(cmd => cmd.startsWith(base));

                // Extract the next word from each match after base length
                const optionSet = new Set();
                filtered.forEach(cmd => {
                    const rest = cmd.slice(base.length);
                    const nextWord = rest.split(' ')[0];
                    if (nextWord && nextWord.startsWith(partial)) {
                        optionSet.add(nextWord);
                    }
                });
                const options = Array.from(optionSet);

                if (options.length === 0) return;

                if (options.length === 1) {
                    // Single match — complete inline
                    writeInput(base + options[0] + ' ');
                } else {
                    // Multiple matches — find longest common prefix
                    const lcp = options.reduce((prefix, opt) => {
                        let i = 0;
                        while (i < prefix.length && i < opt.length && prefix[i] === opt[i]) i++;
                        return prefix.slice(0, i);
                    });

                    if (lcp.length > partial.length) {
                        // LCP extends beyond partial — fill silently
                        writeInput(base + lcp);
                    } else {
                        // Print current prompt line as static, show options, recreate input line
                        const currentText = inp.textContent;
                        const promptLine = document.getElementById('docker-terminal-input-line');

                        // Print the current prompt line as static output
                        this.addTerminalLine(output, `docker@main> ${currentText}`, 'command');
                        // Print options on next line
                        this.addTerminalLine(output, options.join('  '), 'info');

                        // Remove and recreate the input line so getElementById returns a fresh element
                        if (promptLine) {
                            const parent = promptLine.parentNode;
                            promptLine.remove();
                            const newLine = document.createElement('div');
                            newLine.className = 'docker-terminal-input-line';
                            newLine.id = 'docker-terminal-input-line';
                            newLine.innerHTML = `<span class="docker-terminal-prompt">docker@main></span><span id="docker-terminal-input" class="docker-terminal-input" contenteditable="true" spellcheck="false" autocorrect="off" autocapitalize="off" role="textbox" aria-label="Terminal input"></span>`;
                            parent.appendChild(newLine);
                        }

                        // Restore typed text and store tab state
                        writeInput(currentText);
                        tab = { active: true, base, options, index: 0 };
                        scrollToBottom();
                    }
                }
            } else {
                // Any non-Tab key resets tab state
                tab = null;
            }
        });

        // Initial welcome message - displayed as terminal output lines
        this.addTerminalLine(output, '5G WIRELESS LAB', 'info');
        this.addTerminalLine(output, 'Type \'help\' for available commands', 'info');
        
        // Scroll to bottom on init so prompt is visible right after welcome message
        scrollToBottom();
    }

    /**
     * Process Docker command - Realistic Terminal Style
     * @param {string} command - Command to process
     * @param {HTMLElement} output - Output element
     */
    async processCommand(command, output) {
        const cmd = command.toLowerCase().trim();
        const args = command.split(' ');

        if (cmd === 'help' || cmd === '?') {
            this.showHelp(output);
        } else if (cmd === 'ls') {
            this.dockerLS(output);
        } else if (cmd.startsWith('vi ') || cmd === 'vi') {
            const fileName = args[1] || '';
            this.dockerVi(fileName, output);
        } else if (cmd === 'status' || cmd === 'check') {
            this.checkSystemStatus(output);
        } else if (cmd === 'docker compose -f docker-compose.yml up -d' || cmd === 'docker-compose -f docker-compose.yml up -d' ||
                   cmd === 'docker compose up -d' ||
                   cmd === 'docker-compose up -d') {
            await this.dockerComposeUp(output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-gnb.yml up -d') {
            await this.dockerComposeGnbUp(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml up -d' || 
                   cmd === 'docker-compose -f docker-compose-ue.yml up -d') {
            await this.dockerComposeUeUp(output);
        } else if (cmd === 'docker compose -f docker-compose-ran.yml up -d oai-ue1' || 
                   cmd === 'docker-compose -f docker-compose-ran.yml up -d oai-ue1') {
            await this.dockerComposeUe1Up(output);
        } else if (cmd === 'docker compose -f docker-compose-ran.yml up -d oai-ue2' || 
                   cmd === 'docker-compose -f docker-compose-ran.yml up -d oai-ue2') {
            await this.dockerComposeUe2Up(output);
        } else if (cmd === 'docker ps') {
            await this.dockerPS(output);
        } else if (cmd === 'docker network ls') {
            this.dockerNetworkLS(output);
        } else if (cmd.startsWith('docker network inspect ')) {
            const networkName = args.slice(3).join(' ');
            this.dockerNetworkInspect(networkName, output);
        } else if (cmd === 'docker version') {
            this.dockerVersion(output);
        } else if (cmd.startsWith('watch docker compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker-compose -f docker-compose.yml ps -a') ||
                   cmd.startsWith('watch docker compose ps -a')) {
            this.startWatch(output);
        } else if (cmd === 'docker compose -f docker-compose.yml down' ||
                   cmd === 'docker-compose -f docker-compose.yml down' ||
                   cmd === 'docker compose down' ||
                   cmd === 'docker-compose down') {
            await this.dockerComposeDown(output);
         } else if (cmd.startsWith('docker compose -f docker-compose.yml up -d ') ||
                 cmd.startsWith('docker-compose -f docker-compose.yml up -d ') ||
                 cmd.startsWith('docker compose up -d ') ||
                 cmd.startsWith('docker-compose up -d ')) {
             const parts = command.split(' ').filter(Boolean);
             const serviceName = parts[parts.length - 1];
             await this.dockerComposeServiceUp(serviceName, output);
         } else if (cmd.startsWith('docker compose -f docker-compose.yml down ') ||
                 cmd.startsWith('docker-compose -f docker-compose.yml down ') ||
                 cmd.startsWith('docker compose down ') ||
                 cmd.startsWith('docker-compose down ')) {
             const parts = command.split(' ').filter(Boolean);
             const serviceName = parts[parts.length - 1];
             await this.dockerComposeServiceDown(serviceName, output);
        } else if (cmd === 'docker compose -f docker-compose-gnb.yml down' ||
                   cmd === 'docker-compose -f docker-compose-gnb.yml down') {
            await this.dockerComposeGnbDown(output);
        } else if (cmd === 'docker compose -f docker-compose-ue.yml down' ||
                   cmd === 'docker-compose -f docker-compose-ue.yml down') {
            await this.dockerComposeUeDown(output);
        } else if (cmd.startsWith('docker start ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStart(serviceName, output);
        } else if (cmd.startsWith('docker stop ')) {
            const serviceName = args.slice(2).join(' ');
            await this.dockerStop(serviceName, output);
        } else if (cmd === 'cls' || cmd === 'clear') {
            output.innerHTML = '';
        } else if (cmd === 'exit') {
            const closeBtn = document.getElementById('docker-terminal-close');
            if (closeBtn) closeBtn.click();
        } else {
            this.addTerminalLine(output, `${command}: command not found`, 'error');
        }
        // No extra blank line - like real terminal
    }

    /**
     * Check system status
     * @param {HTMLElement} output - Output element
     */
    checkSystemStatus(output) {
        this.addTerminalLine(output, 'System Status Check:', 'info');
        this.addTerminalLine(output, '', 'blank');

        // Check dataStore
        if (window.dataStore) {
            this.addTerminalLine(output, '✅ DataStore: Available', 'success');
            const allNFs = window.dataStore.getAllNFs() || [];
            this.addTerminalLine(output, `   Found ${allNFs.length} Network Function(s)`, 'info');

            if (allNFs.length > 0) {
                this.addTerminalLine(output, '', 'blank');
                this.addTerminalLine(output, 'Network Functions:', 'info');
                allNFs.forEach(nf => {
                    const status = nf.status || 'unknown';
                    const statusColor = status === 'stable' ? 'success' : (status === 'starting' ? 'warning' : 'info');
                    this.addTerminalLine(output, `  - ${nf.name} (${nf.type}): ${status}`, statusColor);
                });
            }
        } else {
            this.addTerminalLine(output, '❌ DataStore: Not available', 'error');
        }

        this.addTerminalLine(output, '', 'blank');

        // Check other managers
        if (window.nfManager) {
            this.addTerminalLine(output, '✅ NFManager: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ NFManager: Not available', 'error');
        }

        if (window.canvasRenderer) {
            this.addTerminalLine(output, '✅ CanvasRenderer: Available', 'success');
        } else {
            this.addTerminalLine(output, '❌ CanvasRenderer: Not available', 'error');
        }
    }

    /**
     * List files in the current directory (matches reference image)
     * @param {HTMLElement} output - Output element
     */
    dockerLS(output) {
        this.addTerminalLine(output, 'docker-compose.yml', 'info');
    }

    /**
     * Open a file in an embedded read-only viewer (vi)
     * @param {string} fileName - File to open
     * @param {HTMLElement} output - Output element
     */
    dockerVi(fileName, output) {
        if (!fileName || fileName !== 'docker-compose.yml') {
            this.addTerminalLine(output, `vi: ${fileName || 'no file'}: No such file or directory`, 'error');
            return;
        }

        const content = `services:
    mysql:
        container_name: "mysql"
        image: ghcr.io/openairinterface/mysql:8.0
        volumes:
            - ./database/oai_db.sql:/docker-entrypoint-initdb.d/oai_db.sql
            - ./healthscripts/mysql-healthcheck.sh:/tmp/mysql-healthcheck.sh
        environment:
            - TZ=Europe/Paris
            - MYSQL_DATABASE=oai_db
            - MYSQL_USER=test
            - MYSQL_PASSWORD=test
            - MYSQL_ROOT_PASSWORD=linux
        healthcheck:
            test: /bin/bash -c "/tmp/mysql-healthcheck.sh"
            interval: 10s
            timeout: 5s
            retries: 30
        networks:
            public_net:
                ipv4_address: 192.168.70.131

    oai-udr:
        container_name: "oai-udr"
        image: ghcr.io/openairinterface/oai-udr:develop
        expose:
            - 80/tcp
            - 8080/tcp
        volumes:
            - ./conf/config.yaml:/openair-udr/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - mysql
            - oai-nrf
        networks:
            public_net:
                ipv4_address: 192.168.70.136

    oai-udm:
        container_name: "oai-udm"
        image: ghcr.io/openairinterface/oai-udm:develop
        expose:
            - 80/tcp
            - 8080/tcp
        volumes:
            - ./conf/config.yaml:/openair-udm/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - oai-udr
        networks:
            public_net:
                ipv4_address: 192.168.70.137

    oai-ausf:
        container_name: "oai-ausf"
        image: ghcr.io/openairinterface/oai-ausf:develop
        expose:
            - 80/tcp
            - 8080/tcp
        volumes:
            - ./conf/config.yaml:/openair-ausf/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - oai-udm
        networks:
            public_net:
                ipv4_address: 192.168.70.138

    oai-nrf:
        container_name: "oai-nrf"
        image: ghcr.io/openairinterface/oai-nrf:develop
        expose:
            - 80/tcp
            - 8080/tcp
        volumes:
            - ./conf/config.yaml:/openair-nrf/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        networks:
            public_net:
                ipv4_address: 192.168.70.130

    oai-amf:
        container_name: "oai-amf"
        image: ghcr.io/openairinterface/oai-amf:develop
        expose:
            - 80/tcp
            - 8080/tcp
            - 38412/sctp
        volumes:
            - ./conf/config.yaml:/openair-amf/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - mysql
            - oai-nrf
            - oai-ausf
        networks:
            public_net:
                ipv4_address: 192.168.70.132

    oai-smf:
        container_name: "oai-smf"
        image: ghcr.io/openairinterface/oai-smf:develop
        expose:
            - 80/tcp
            - 8080/tcp
            - 8805/udp
        volumes:
            - ./conf/config.yaml:/openair-smf/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - oai-nrf
            - oai-amf
        networks:
            public_net:
                ipv4_address: 192.168.70.133

    oai-upf:
        container_name: "oai-upf"
        image: ghcr.io/openairinterface/oai-upf:develop
        expose:
            - 80/tcp
            - 2152/udp
            - 8805/udp
        volumes:
            - ./conf/config.yaml:/openair-upf/etc/config.yaml
        environment:
            - TZ=Europe/Paris
        depends_on:
            - oai-nrf
            - oai-smf
        cap_add:
            - NET_ADMIN
            - SYS_ADMIN
        cap_drop:
            - ALL
        privileged: true
        networks:
            public_net:
                ipv4_address: 192.168.70.134

    oai-traffic-server:
        privileged: true
        init: true
        container_name: oai-ext-dn
        image: ghcr.io/openairinterface/trf-gen-cn5g:latest
        environment:
            - UPF_FQDN=oai-upf
            - UE_NETWORK=10.0.0.0/24
            - USE_FQDN=yes
        healthcheck:
            test: /bin/bash -c "ip r | grep 12.1.1"
            interval: 10s
            timeout: 5s
            retries: 5
        networks:
            public_net:
                ipv4_address: 192.168.70.135

networks:
    public_net:
        driver: bridge
        name: oaiworkshop
        ipam:
            config:
                - subnet: 192.168.70.128/26
        driver_opts:
            com.docker.network.bridge.name: "oaiworkshop"`;

        this.enterViMode(fileName, content);
    }

    /**
     * Enter embedded vi mode inside terminal window
     * @param {string} fileName - File name
     * @param {string} content - File content
     */
    enterViMode(fileName, content) {
        const terminalContent = document.getElementById('docker-terminal-content');
        if (!terminalContent) return;

        // Save and hide current output/input
        const output = document.getElementById('docker-terminal-output');
        const inputLine = document.getElementById('docker-terminal-input-line');
        if (output) output.style.display = 'none';
        if (inputLine) inputLine.style.display = 'none';

        // Create vi container (covers the area)
        const viContainer = document.createElement('div');
        viContainer.id = 'vi-editor-container';
        viContainer.style.cssText = `
            position: absolute;
            top: 35px; /* Adjust for titlebar height */
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            display: flex;
            flex-direction: column;
            z-index: 100;
        `;

        const editorBody = document.createElement('div');
        editorBody.style.cssText = `
            flex: 1;
            padding: 10px;
            overflow-y: auto;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.5;
            color: #d4d4d4;
        `;

        const lines = content.split('\n');
        let highlightedContent = '';
        lines.forEach((line, index) => {
            const lineNum = (index + 1).toString().padStart(2, ' ');
            // Simple syntax highlighting for YAML
            let formattedLine = line
                .replace(/^(\s*)([a-zA-Z0-9_-]+):/, '$1<span style="color:#9cdcfe">$2</span>:')
                .replace(/: "(.*)"$/, ': <span style="color:#ce9178">"$1"</span>')
                .replace(/: (.*)$/, (match, group) => {
                    if (group.includes('span')) return match;
                    return ': <span style="color:#b5cea8">' + group + '</span>';
                });
            
            highlightedContent += `<div style="display:flex; white-space: pre;"><span style="color:#858585; min-width: 30px; margin-right: 15px; user-select:none; text-align: right;">${lineNum}</span><span>${formattedLine}</span></div>`;
        });

        editorBody.innerHTML = highlightedContent;

        const statusBar = document.createElement('div');
        statusBar.style.cssText = `
            height: 25px;
            background: #264f78;
            color: #fff;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px;
            font-size: 11px;
            font-family: sans-serif;
        `;
        statusBar.innerHTML = `<span>"${fileName}" [readonly]</span><span>Press 'q' or ':q' to close`;

        viContainer.appendChild(editorBody);
        viContainer.appendChild(statusBar);
        terminalContent.appendChild(viContainer);

        this.isInViMode = true;
        this.viCommandBuffer = '';
        this.viGBuffer = ''; // For 'gg' command

        // Custom key handler for vi mode - Full vi navigation
        this.viKeyHandler = (e) => {
            if (!this.isInViMode) return;

            // Prevent all keys from reaching terminal
            e.preventDefault();
            e.stopPropagation();

            const viBody = document.querySelector('#vi-editor-container > div:first-child');
            if (!viBody) return;

            // Handle 'g' for 'gg' (go to top)
            if (e.key.toLowerCase() === 'g') {
                if (this.viGBuffer === 'g') {
                    // Second 'g' - go to top
                    viBody.scrollTop = 0;
                    this.viGBuffer = '';
                } else {
                    // First 'g' - wait for second
                    this.viGBuffer = 'g';
                    setTimeout(() => { this.viGBuffer = ''; }, 1000); // Reset after 1 second
                }
                return;
            }

            // Handle 'G' (go to bottom)
            if (e.key === 'G') {
                viBody.scrollTop = viBody.scrollHeight;
                return;
            }

            // Handle 'j' (scroll down one line)
            if (e.key.toLowerCase() === 'j') {
                viBody.scrollTop += 20; // Approximate line height
                return;
            }

            // Handle 'k' (scroll up one line)
            if (e.key.toLowerCase() === 'k') {
                viBody.scrollTop -= 20; // Approximate line height
                return;
            }

            // Handle 'f' (scroll forward one page)
            if (e.key.toLowerCase() === 'f') {
                viBody.scrollTop += viBody.clientHeight;
                return;
            }

            // Handle 'b' (scroll backward one page)
            if (e.key.toLowerCase() === 'b') {
                viBody.scrollTop -= viBody.clientHeight;
                return;
            }

            // Handle Arrow keys for scrolling
            if (e.key === 'ArrowDown') {
                viBody.scrollTop += 20;
                return;
            }

            if (e.key === 'ArrowUp') {
                viBody.scrollTop -= 20;
                return;
            }

            if (e.key === 'PageDown') {
                viBody.scrollTop += viBody.clientHeight;
                return;
            }

            if (e.key === 'PageUp') {
                viBody.scrollTop -= viBody.clientHeight;
                return;
            }

            // Handle simple 'q' key to exit (like less/more pagers)
            if (e.key.toLowerCase() === 'q' && this.viCommandBuffer === '') {
                this.exitViMode();
                return;
            }

            // Handle ':' to start command mode
            if (e.key === ':') {
                this.viCommandBuffer = ':';
                return;
            }

            // If in command mode, handle command input
            if (this.viCommandBuffer === ':') {
                if (e.key === 'q' || e.key === 'Q') {
                    // :q or :Q command
                    this.exitViMode();
                    return;
                } else if (e.key === 'Escape') {
                    // Cancel command mode
                    this.viCommandBuffer = '';
                    return;
                }
            }

            // Handle Enter key in command mode
            if (e.key === 'Enter' && this.viCommandBuffer.startsWith(':')) {
                const cmd = this.viCommandBuffer.slice(1).toLowerCase();
                if (['q', 'q!', 'wq', 'quit', 'exit'].includes(cmd)) {
                    this.exitViMode();
                }
                this.viCommandBuffer = '';
                return;
            }

            // Handle Escape to exit or clear command buffer
            if (e.key === 'Escape') {
                if (this.viCommandBuffer) {
                    this.viCommandBuffer = '';
                } else {
                    this.exitViMode();
                }
                return;
            }
        };
        // Use capture phase to intercept BEFORE main terminal handler
        document.addEventListener('keydown', this.viKeyHandler, true);
    }

    /**
     * Exit vi mode and restore terminal
     */
    exitViMode() {
        const viContainer = document.getElementById('vi-editor-container');
        if (viContainer) viContainer.remove();

        const output = document.getElementById('docker-terminal-output');
        const inputLine = document.getElementById('docker-terminal-input-line');
        if (output) output.style.display = 'block';
        if (inputLine) inputLine.style.display = 'flex';
        
        this.isInViMode = false;
        document.removeEventListener('keydown', this.viKeyHandler, true);
        
        // Refocus main terminal input
        const input = document.getElementById('docker-terminal-input');
        if (input) input.focus();
    }

    /**
     * Show help
     * @param {HTMLElement} output - Output element
     */
    showHelp(output) {
        const helpText = [
            'Available Docker Commands:',
            '',
            '  docker compose -f docker-compose.yml up -d',
            '    Start all Core Network Functions (one-click deployment)',
            '',
            '  docker compose -f docker-compose-gnb.yml up -d',
            '    Start gNB (gNodeB) container',
            '',
            '  docker compose -f docker-compose-ue.yml up -d',
            '    Start both UE containers (oai-ue1 and oai-ue2)',
            '',
            '  docker compose -f docker-compose-ran.yml up -d oai-ue1',
            '    Start only UE1 container',
            '',
            '  docker compose -f docker-compose-ran.yml up -d oai-ue2',
            '    Start only UE2 container',
            '',
            '  docker ps',
            '    Show running Docker containers',
            '',
            '  docker network ls',
            '    List all Docker networks',
            '',
            '  docker network inspect <network-name>',
            '    Inspect a specific Docker network (bridge, host, none, oaiworkshop)',
            '',
            '  docker version',
            '    Show Docker version information',
            '',
            '  watch docker compose -f docker-compose.yml ps -a',
            '    Watch service status with auto-refresh (every 1 second)',
            '',
            '  docker compose -f docker-compose.yml down',
            '    Stop and remove all core network services',
            '',
            '  docker compose -f docker-compose-gnb.yml down',
            '    Stop and remove gNB container',
            '',
            '  docker compose -f docker-compose-ue.yml down',
            '    Stop and remove all UE containers',
            '',
            '  docker start <service-name>',
            '    Start a specific Network Function',
            '',
            '  docker stop <service-name>',
            '    Stop a specific Network Function',
            '',
            '  ls',
            '    List files in current directory',
            '',
            '  vi <file-name>',
            '    Open file in read-only viewer (e.g., vi docker-compose.yml)',
            '',
            '  cls / clear',
            '    Clear the terminal screen',
            '',
            '  status / check',
            '    Check system status and list available NFs',
            '',
            '  exit',
            '    Close the terminal',
            ''
        ];

        helpText.forEach(line => {
            this.addTerminalLine(output, line, 'info');
        });
    }

    /**
     * Execute docker compose up -d (start all NFs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUp(output) {
        // Check if dataStore is available
        if (!window.dataStore) {
            this.addTerminalLine(output, 'Error: DataStore not initialized. Please refresh the page.', 'error');
            console.error('❌ DataStore not available');
            return;
        }

        // Check if NFManager is available
        if (!window.nfManager) {
            this.addTerminalLine(output, 'Error: NFManager not initialized. Please refresh the page.', 'error');
            console.error('❌ NFManager not available');
            return;
        }

        // Get existing NFs from data store (exclude gNB and UE for core network deployment)
        let existingNFs = window.dataStore.getAllNFs() || [];
        existingNFs = existingNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        // Load topology from one-click.json to get expected NFs
        let topology = null;
        try {
            topology = await this.loadOneClickTopology();
            if (!topology) {
                throw new Error('Failed to load one-click.json');
            }
        } catch (error) {
            this.addTerminalLine(output, `❌ Failed to load topology: ${error.message}`, 'error');
            this.addTerminalLine(output, 'Falling back to default NF creation...', 'warning');
            this.addTerminalLine(output, '', 'blank');

            // Fallback to default NFs if topology file fails
            await this.createDefaultNFs(output);
            existingNFs = window.dataStore.getAllNFs();
            existingNFs = existingNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');
        }

        // Filter topology to exclude gNB and UE
        const filteredTopology = topology ? this.filterTopology(topology) : null;
        const expectedNFs = filteredTopology?.nfs || [];

        // Find which NFs are missing (need to be created)
        const existingNFTypes = new Set(existingNFs.map(nf => nf.type));
        const missingNFs = expectedNFs.filter(nf => !existingNFTypes.has(nf.type));

        // Create buses from one-click.json if they don't exist
        if (filteredTopology && filteredTopology.buses && window.busManager) {
            const existingBuses = window.dataStore.getAllBuses() || [];
            for (const busTemplate of filteredTopology.buses) {
                const busExists = existingBuses.find(b => b.name === busTemplate.name);
                if (!busExists) {
                    const bus = window.busManager.createBusLine(
                        busTemplate.orientation || 'horizontal',
                        busTemplate.position || null,
                        busTemplate.length || 600,
                        busTemplate.name
                    );
                    if (bus && busTemplate.color) {
                        bus.color = busTemplate.color;
                        // Bus is already added to dataStore by createBusLine, just update it
                        const updatedBus = window.dataStore.getBusById(bus.id);
                        if (updatedBus) {
                            updatedBus.color = busTemplate.color;
                        }
                    }
                }
            }
        }

        // Create missing NFs with positions from one-click.json
        const nfsToStart = [];
        
        if (missingNFs.length > 0) {
            // Import missing NFs
            const importTime = Date.now();
            for (const nfTemplate of missingNFs) {
                // Use position from one-click.json
                const position = nfTemplate.position || { x: 100, y: 100 };
                
                // Create NF using NFManager
                const nf = window.nfManager.createNetworkFunction(nfTemplate.type, position);
                if (nf) {
                    // Copy config from template
                    if (nfTemplate.config) {
                        nf.config = { ...nf.config, ...nfTemplate.config };
                    }
                    nf.createdAt = importTime;
                    nf.status = 'starting';
                    nf.statusTimestamp = Date.now();
                    
                    // Load icon if available
                    if (nfTemplate.icon) {
                        const img = new Image();
                        img.onload = () => {
                            nf.iconImage = img;
                            if (window.canvasRenderer) {
                                window.canvasRenderer.render();
                            }
                        };
                        img.onerror = () => {
                            console.warn(`Failed to load icon for ${nf.name}: ${nfTemplate.icon}`);
                        };
                        img.src = nfTemplate.icon;
                    }
                    
                    window.dataStore.updateNF(nf.id, nf);
                    
                    // Auto-connect to buses from one-click.json
                    await this.autoConnectToBusesFromOneClick(nf);
                    
                    // Trigger log engine
                    if (window.logEngine) {
                        window.logEngine.onNFAdded(nf);
                    }
                    
                    nfsToStart.push(nf);
                }
            }
        }

        // Get all NFs again (including newly created ones)
        let allNFs = window.dataStore.getAllNFs();
        allNFs = allNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        // Calculate counts
        const totalNFs = allNFs.length;
        const alreadyRunning = existingNFs.length;
        const newlyCreated = nfsToStart.length;
        const networkCount = this.oaiWorkshopNetworkExists ? 0 : 1;
        const totalOperations = networkCount + newlyCreated;

        // Show Docker Compose style output
        if (totalOperations > 0) {
            this.addTerminalLine(output, `[+] Running ${totalOperations}/${totalOperations}`, 'info');
        } else {
            this.addTerminalLine(output, `[+] Running 0/0`, 'info');
            this.addTerminalLine(output, '', 'blank');
            this.addTerminalLine(output, 'All services are already running.', 'info');
            return;
        }

        // Create network if it doesn't exist
        if (!this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, ' ✔ Network oaiworkshop Created' + ' '.repeat(20) + '0.2s', 'success');
            this.oaiWorkshopNetworkExists = true;
            this.oaiWorkshopCreatedTime = Date.now();
            await this.delay(200);
        }

        // Start only newly created NFs (skip already running ones)
        for (const nf of nfsToStart) {
            // Skip gNB and UE - they have separate compose files
            if (nf.type === 'gNB' || nf.type === 'UE') {
                continue;
            }

            // Get fresh NF from dataStore to ensure we have the latest
            const freshNF = window.dataStore.getNFById(nf.id);
            if (!freshNF) {
                continue;
            }

            // Store creation timestamp if not already set
            if (!freshNF.createdAt) {
                freshNF.createdAt = Date.now();
            }

            // Get service name
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[freshNF.type] || freshNF.type.toLowerCase();

            // Show container creation with timing (random between 0.8s and 2.3s)
            const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1); // 0.8s to 2.3s
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Started${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000); // Convert to milliseconds

            // Set status to starting (preserve createdAt)
            freshNF.status = 'starting';
            freshNF.statusTimestamp = Date.now();

            // Ensure createdAt is preserved
            if (!freshNF.createdAt) {
                freshNF.createdAt = Date.now();
            }

            window.dataStore.updateNF(freshNF.id, freshNF);

            // Generate startup log
            if (window.logEngine) {
                window.logEngine.addLog(freshNF.id, 'INFO', `${freshNF.name} starting via docker compose`, {
                    ipAddress: freshNF.config.ipAddress,
                    port: freshNF.config.port,
                    protocol: freshNF.config.httpProtocol,
                    status: 'starting',
                    source: 'docker-compose'
                });
            }

            // After 5 seconds, set to stable
            setTimeout(() => {
                const updatedNF = window.dataStore?.getNFById(freshNF.id);
                if (updatedNF) {
                    updatedNF.status = 'stable';
                    updatedNF.statusTimestamp = Date.now();

                    // Preserve createdAt timestamp
                    if (!updatedNF.createdAt && freshNF.createdAt) {
                        updatedNF.createdAt = freshNF.createdAt;
                    }

                    window.dataStore.updateNF(updatedNF.id, updatedNF);

                    // Generate stable log
                    if (window.logEngine) {
                        window.logEngine.addLog(updatedNF.id, 'SUCCESS', `${updatedNF.name} is now STABLE and ready for connections`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds',
                            readyForConnections: true
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        this.addTerminalLine(output, '', 'blank');

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml up -d (start gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        // Check if gNB already exists
        const allNFs = window.dataStore?.getAllNFs() || [];
        let gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb && window.nfManager) {
            // Create gNB if it doesn't exist
            const position = window.nfManager.calculateAutoPosition('gNB', 1);
            gnb = window.nfManager.createNetworkFunction('gNB', position);
            
            if (gnb) {
                gnb.createdAt = Date.now();
                gnb.status = 'starting';
                gnb.statusTimestamp = Date.now();
                window.dataStore.updateNF(gnb.id, gnb);
            }
        }

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (gnb) {
            // Set to stable after 5 seconds
            setTimeout(() => {
                const updatedGnb = window.dataStore?.getNFById(gnb.id);
                if (updatedGnb) {
                    updatedGnb.status = 'stable';
                    updatedGnb.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedGnb.id, updatedGnb);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedGnb.id, 'SUCCESS', `${updatedGnb.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml up -d (start both UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeUp(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 2/2', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        const ueTypes = ['UE', 'UE']; // Two UEs
        const ueNames = ['oai-ue1', 'oai-ue2'];
        const createdUEs = [];

        for (let i = 0; i < 2; i++) {
            let ue = allNFs.find(nf => nf.type === 'UE' && nf.name === `UE-${i + 1}`);

            if (!ue && window.nfManager) {
                const position = window.nfManager.calculateAutoPosition('UE', i + 1);
                ue = window.nfManager.createNetworkFunction('UE', position);
                
                if (ue) {
                    ue.name = `UE-${i + 1}`;
                    ue.createdAt = Date.now();
                    ue.status = 'starting';
                    ue.statusTimestamp = Date.now();
                    window.dataStore.updateNF(ue.id, ue);
                    createdUEs.push(ue);
                }
            } else if (ue) {
                createdUEs.push(ue);
            }

            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            this.addTerminalLine(output, `✔ Container ${ueNames[i]} Created${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);
        }

        // Set UEs to stable after 5 seconds
        createdUEs.forEach(ue => {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        });

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue1 (start UE1 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe1Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue1 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-1');

        if (!ue1 && window.nfManager) {
            const position = window.nfManager.calculateAutoPosition('UE', 1);
            ue1 = window.nfManager.createNetworkFunction('UE', position);
            
            if (ue1) {
                ue1.name = 'UE-1';
                ue1.createdAt = Date.now();
                ue1.status = 'starting';
                ue1.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue1.id, ue1);
            }
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue1 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue1) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue1.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ran.yml up -d oai-ue2 (start UE2 only)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUe2Up(output) {
        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, 'WARN[0000] Found orphan containers ([oai-upf oai-smf oai-amf oai-ausf oai-udm oai-udr mysql oai-nrf oai-ext-dn]) for this project. If you removed or renamed this service in your compose file, you can run this command with the --remove-orphans flag to clean it up.', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const allNFs = window.dataStore?.getAllNFs() || [];
        let ue2 = allNFs.find(nf => nf.type === 'UE' && nf.name === 'UE-2');

        if (!ue2 && window.nfManager) {
            const position = window.nfManager.calculateAutoPosition('UE', 2);
            ue2 = window.nfManager.createNetworkFunction('UE', position);
            
            if (ue2) {
                ue2.name = 'UE-2';
                ue2.createdAt = Date.now();
                ue2.status = 'starting';
                ue2.statusTimestamp = Date.now();
                window.dataStore.updateNF(ue2.id, ue2);
            }
        }

        const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-ue2 Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        if (ue2) {
            setTimeout(() => {
                const updatedUe = window.dataStore?.getNFById(ue2.id);
                if (updatedUe) {
                    updatedUe.status = 'stable';
                    updatedUe.statusTimestamp = Date.now();
                    window.dataStore.updateNF(updatedUe.id, updatedUe);

                    if (window.logEngine) {
                        window.logEngine.addLog(updatedUe.id, 'SUCCESS', `${updatedUe.name} is now STABLE and ready`, {
                            previousStatus: 'starting',
                            newStatus: 'stable',
                            uptime: '5 seconds'
                        });
                    }

                    if (window.canvasRenderer) {
                        window.canvasRenderer.render();
                    }
                }
            }, 5000);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-gnb.yml down (stop gNB)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeGnbDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const gnb = allNFs.find(nf => nf.type === 'gNB');

        if (!gnb) {
            this.addTerminalLine(output, 'No gNB container to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, '[+] Running 1/1', 'info');

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container oai-gnb Removed${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Remove gNB
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(gnb.id);
        } else if (window.dataStore) {
            window.dataStore.removeNF(gnb.id);
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker compose -f docker-compose-ue.yml down (stop all UEs)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeUeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const ues = allNFs.filter(nf => nf.type === 'UE');

        if (ues.length === 0) {
            this.addTerminalLine(output, 'No UE containers to stop.', 'info');
            return;
        }

        this.addTerminalLine(output, `[+] Running ${ues.length}/${ues.length}`, 'info');

        for (let i = 0; i < ues.length; i++) {
            const ue = ues[i];
            const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(1);
            this.addTerminalLine(output, `✔ Container oai-ue${i + 1} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);

            // Remove UE
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(ue.id);
            } else if (window.dataStore) {
                window.dataStore.removeNF(ue.id);
            }
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Execute docker ps (show running containers)
     * @param {HTMLElement} output - Output element
     */
    async dockerPS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];

        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No containers running.', 'info');
            return;
        }

        // Header
        this.addTerminalLine(output, 'CONTAINER ID   IMAGE                                          COMMAND                  CREATED       STATUS                 PORTS                                                   NAMES', 'info');
        this.addTerminalLine(output, '────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────', 'info');

        // Map NF types to Docker service names
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        // Image map
        const imageMap = {
            'AMF': 'ghcr.io/openairinterface/oai-amf:develop',
            'SMF': 'ghcr.io/openairinterface/oai-smf:develop',
            'UPF': 'ghcr.io/openairinterface/oai-upf:develop',
            'AUSF': 'ghcr.io/openairinterface/oai-ausf:develop',
            'UDM': 'ghcr.io/openairinterface/oai-udm:develop',
            'UDR': 'ghcr.io/openairinterface/oai-udr:develop',
            'NRF': 'ghcr.io/openairinterface/oai-nrf:develop',
            'PCF': 'ghcr.io/openairinterface/oai-pcf:develop',
            'NSSF': 'ghcr.io/openairinterface/oai-nssf:develop',
            'MySQL': 'ghcr.io/openairinterface/mysql:8.0',
            'ext-dn': 'ghcr.io/openairinterface/trf-gen-cn5g:latest',
            'gNB': 'ghcr.io/openairinterface/oai-gnb:develop',
            'UE': 'ghcr.io/openairinterface/oai-ue:develop'
        };

        allNFs.forEach((nf, index) => {
            const containerId = this.generateContainerId();
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `ghcr.io/openairinterface/oai-${nf.type.toLowerCase()}:develop`;
            const status = nf.status === 'stable' ? 'Up (healthy)' : 'Up (starting)';
            const ports = this.getPortsForNF(nf);

            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const createdTime = this.formatCreationTime(createdAt);

            const line = `${containerId}   ${image.padEnd(45)} "${serviceName}"   ${createdTime.padEnd(13)} ${status.padEnd(20)} ${ports.padEnd(55)} ${serviceName}`;
            this.addTerminalLine(output, line, nf.status === 'stable' ? 'success' : 'warning');
        });
    }

    /**
     * Start watch mode for docker compose ps -a
     * @param {HTMLElement} output - Output element
     */
    startWatch(output) {
        if (this.isWatching) {
            this.addTerminalLine(output, 'Watch mode is already running. Use Ctrl+C to stop.', 'warning');
            return;
        }

        this.isWatching = true;

        // Hide input line while watch is running
        const inputLine = document.getElementById('docker-terminal-input-line');
        if (inputLine) inputLine.style.display = 'none';

        this.addTerminalLine(output, 'Starting watch mode (refreshes every 1 second)...', 'info');
        this.addTerminalLine(output, 'Press Ctrl+C to stop watching', 'info');
        this.addTerminalLine(output, '', 'blank');

        // Store initial content length to know where to clear from
        const initialLength = output.querySelectorAll('.docker-terminal-line').length;

        const content = document.getElementById('docker-terminal-content');

        // Initial display
        this.showDockerComposePS(output);

        // Refresh every 1 second — replace lines in-place to avoid scroll jumps
        this.watchInterval = setInterval(() => {
            // Lock scroll position before DOM changes
            const isAtBottom = !content || content.scrollTop + content.clientHeight >= content.scrollHeight - 5;
            const savedScrollTop = content ? content.scrollTop : 0;

            // Remove lines added after the initial messages
            const allLines = output.querySelectorAll('.docker-terminal-line');
            const linesToRemove = Array.from(allLines).slice(initialLength);
            linesToRemove.forEach(line => line.remove());

            // Add fresh output (addTerminalLine auto-scrolls, we'll correct after)
            this.showDockerComposePS(output);

            // Restore scroll position — only follow bottom if user was already there
            if (content) {
                if (isAtBottom) {
                    content.scrollTop = content.scrollHeight;
                } else {
                    content.scrollTop = savedScrollTop;
                }
            }
        }, 1000);
    }

    /**
     * Stop watch mode
     */
    stopWatch() {
        console.log('🛑 stopWatch() called, isWatching:', this.isWatching, 'watchInterval:', this.watchInterval);
        
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
        
        this.isWatching = false;

        // Restore input line
        const inputLine = document.getElementById('docker-terminal-input-line');
        if (inputLine) {
            inputLine.style.display = 'flex';
            console.log('✅ Input line restored');
        } else {
            console.warn('⚠️ Input line not found');
        }
        
        const input = document.getElementById('docker-terminal-input');
        if (input) {
            input.focus();
            console.log('✅ Input focused');
        } else {
            console.warn('⚠️ Input element not found');
        }
        
        console.log('✅ Watch mode stopped');
    }

    /**
     * Show docker compose ps -a output
     * @param {HTMLElement} output - Output element
     */
    showDockerComposePS(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const timestamp = new Date().toLocaleString();

        // Header with timestamp
        this.addTerminalLine(output, `Every 1.0s: docker compose -f docker-compose.yml ps -a`, 'info');
        this.addTerminalLine(output, `Timestamp: ${timestamp}`, 'info');
        this.addTerminalLine(output, '', 'blank');

        if (allNFs.length === 0) {
            this.addTerminalLine(output, 'No services found.', 'info');
            return;
        }

        // Table header
        this.addTerminalLine(output, 'NAME         IMAGE                                     COMMAND                  SERVICE              CREATED              STATUS                        PORTS', 'info');
        this.addTerminalLine(output, '════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════', 'info');

        // Service name map
        const serviceNameMap = {
            'AMF': 'oai-amf',
            'SMF': 'oai-smf',
            'UPF': 'oai-upf',
            'AUSF': 'oai-ausf',
            'UDM': 'oai-udm',
            'UDR': 'oai-udr',
            'NRF': 'oai-nrf',
            'PCF': 'oai-pcf',
            'NSSF': 'oai-nssf',
            'MySQL': 'mysql',
            'ext-dn': 'ext-dn',
            'gNB': 'oai-gnb',
            'UE': 'oai-ue'
        };

        const imageMap = {
            'AMF': 'oaisoftwarealliance/oai-amf:2024-june',
            'SMF': 'oaisoftwarealliance/oai-smf:2024-june',
            'UPF': 'oaisoftwarealliance/oai-upf:2024-june',
            'AUSF': 'oaisoftwarealliance/oai-ausf:2024-june',
            'UDM': 'oaisoftwarealliance/oai-udm:2024-june',
            'UDR': 'oaisoftwarealliance/oai-udr:2024-june',
            'NRF': 'oaisoftwarealliance/oai-nrf:2024-june',
            'PCF': 'oaisoftwarealliance/oai-pcf:2024-june',
            'NSSF': 'oaisoftwarealliance/oai-nssf:2024-june',
            'MySQL': 'mysql:8.0',
            'ext-dn': 'oaisoftwarealliance/trf-gen-cn5g:latest',
            'gNB': 'oaisoftwarealliance/oai-gnb:2024-june',
            'UE': 'oaisoftwarealliance/oai-ue:2024-june'
        };

        allNFs.forEach(nf => {
            const serviceName = serviceNameMap[nf.type] || `oai-${nf.type.toLowerCase()}`;
            const image = imageMap[nf.type] || `oaisoftwarealliance/oai-${nf.type.toLowerCase()}:2024-june`;

            // Calculate creation time
            const createdAt = nf.createdAt || nf.statusTimestamp || Date.now();
            const created = this.formatCreationTimeForWatch(createdAt);
            
            // Status display based on NF status
            let status, statusColor, statusIcon;
            if (nf.status === 'stable') {
                status = `Up ${created} (healthy)`;
                statusColor = 'success';
                statusIcon = '🟢';
            } else if (nf.status === 'starting') {
                status = `Up ${created} (starting)`;
                statusColor = 'warning';
                statusIcon = '🟡';
            } else if (nf.status === 'stopped') {
                status = `Exited (0) ${created}`;
                statusColor = 'error';
                statusIcon = '🔴';
            } else {
                status = `Up ${created} (${nf.status})`;
                statusColor = 'info';
                statusIcon = '⚪';
            }
            
            const ports = this.getPortsForNF(nf);

            const line = `${serviceName.padEnd(12)} ${image.padEnd(38)} "${serviceName}"   ${serviceName.padEnd(15)} ${created.padEnd(20)} ${status.padEnd(28)} ${ports}`;
            this.addTerminalLine(output, `${statusIcon} ${line}`, statusColor);
        });
    }

    /**
     * Execute docker compose down (stop and remove all core network services)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeDown(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        
        // Filter to only core network NFs (exclude gNB and UE)
        const coreNFs = allNFs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');

        if (coreNFs.length === 0) {
            this.addTerminalLine(output, 'No core network services to stop.', 'info');
            return;
        }

        // Collect all NF IDs first (before deletion to avoid iteration issues)
        const nfIds = coreNFs.map(nf => ({ id: nf.id, name: nf.name, type: nf.type }));

        // Show Docker Compose style output
        this.addTerminalLine(output, `[+] Running ${nfIds.length + 1}/${nfIds.length + 1}`, 'info');

        // Stop and remove each service
        for (const nfInfo of nfIds) {
            // Skip gNB and UE (double check)
            if (nfInfo.type === 'gNB' || nfInfo.type === 'UE') {
                continue;
            }

            // Get service name
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nfInfo.type] || nfInfo.type.toLowerCase();

            // Random delay between 0.8s and 2.3s
            const randomDelay = (Math.random() * 1.5 + 0.8).toFixed(1);
            this.addTerminalLine(output, ` ✔ Container ${serviceName.padEnd(16)} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
            await this.delay(parseFloat(randomDelay) * 1000);

            // Actually remove the NF (this also removes connections)
            if (window.nfManager) {
                window.nfManager.deleteNetworkFunction(nfInfo.id);
            } else if (window.dataStore) {
                window.dataStore.removeNF(nfInfo.id);
            }
        }

        // Remove only bus connections for the removed core NFs (preserve buses themselves)
        if (window.dataStore) {
            const removedNFIds = new Set(nfIds.map(n => n.id));
            const allBusConnections = window.dataStore.getAllBusConnections() || [];
            allBusConnections
                .filter(bc => removedNFIds.has(bc.nfId))
                .forEach(bc => window.dataStore.removeBusConnection(bc.id));
        }

        // Remove network
        this.addTerminalLine(output, ` ✔ Network oaiworkshop Removed${' '.repeat(20)}0.2s`, 'success');
        this.oaiWorkshopNetworkExists = false;
        this.oaiWorkshopCreatedTime = null;

        this.addTerminalLine(output, '', 'blank');

        // Re-render canvas
        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Start a specific service
     * @param {string} serviceName - Service name to start
     * @param {HTMLElement} output - Output element
     */
    
    /**
     * Handle docker compose up -d <service> (start a specific service via compose)
     * @param {string} serviceName - Service name (e.g., oai-nrf)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeServiceUp(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker compose -f docker-compose.yml up -d <service-name>', 'error');
            return;
        }

        // Map docker service name to NF type
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'oai-ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const allNFs = window.dataStore?.getAllNFs() || [];

        let nf = null;
        if (nfType) {
            nf = allNFs.find(n => n.type === nfType);
        }

        // If not found, try to find by exact service name stored as name
        if (!nf) {
            nf = allNFs.find(n => {
                const mapped = (serviceNameMap[((`oai-${n.type}`) || '').toLowerCase()]);
                return n.name === serviceName || (`oai-${n.type || ''}`) === serviceName;
            });
        }

        // If still not found, create via nfManager when possible
        if (!nf && window.nfManager && nfType) {
            // Try to get position from one-click.json first
            let position = await this.getPositionFromOneClick(nfType);
            
            // Fallback to auto-position if not found in one-click.json
            if (!position) {
                position = window.nfManager.calculateAutoPosition(nfType, 1);
            }

            nf = window.nfManager.createNetworkFunction(nfType, position);
            if (nf) {
                nf.createdAt = Date.now();
                nf.status = 'starting';
                nf.statusTimestamp = Date.now();
                window.dataStore.updateNF(nf.id, nf);

                // Auto-connect to buses from one-click.json
                await this.autoConnectToBusesFromOneClick(nf);
            }
        }

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, 'WARN[0000] No services to build', 'warning');
        this.addTerminalLine(output, '[+] up 1/1', 'info');

        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container ${serviceName} Created${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Mark starting and schedule stable status
        if (!nf.createdAt) nf.createdAt = Date.now();
        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        setTimeout(() => {
            const updated = window.dataStore?.getNFById(nf.id);
            if (updated) {
                updated.status = 'stable';
                updated.statusTimestamp = Date.now();
                window.dataStore.updateNF(updated.id, updated);

                if (window.logEngine) {
                    window.logEngine.addLog(updated.id, 'SUCCESS', `${updated.name} is now STABLE and ready`, {
                        previousStatus: 'starting', newStatus: 'stable', uptime: '5 seconds'
                    });
                }

                if (window.canvasRenderer) window.canvasRenderer.render();
            }
        }, 5000);

        if (window.canvasRenderer) window.canvasRenderer.render();
    }

    /**
     * Handle docker compose down <service> (stop a specific service via compose)
     * @param {string} serviceName - Service name (e.g., oai-nrf)
     * @param {HTMLElement} output - Output element
     */
    async dockerComposeServiceDown(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker compose -f docker-compose.yml down <service-name>', 'error');
            return;
        }

        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'oai-ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const allNFs = window.dataStore?.getAllNFs() || [];

        let nf = null;
        if (nfType) nf = allNFs.find(n => n.type === nfType);
        if (!nf) nf = allNFs.find(n => n.name === serviceName || (`oai-${n.type || ''}`) === serviceName);

        if (!nf) {
            this.addTerminalLine(output, `No ${serviceName} container to stop.`, 'info');
            return;
        }

        this.addTerminalLine(output, '[+] Running 1/1', 'info');
        const randomDelay = (Math.random() * 0.3 + 0.1).toFixed(1);
        this.addTerminalLine(output, `✔ Container ${serviceName} Removed${' '.repeat(20)}${randomDelay}s`, 'success');
        await this.delay(parseFloat(randomDelay) * 1000);

        // Remove NF
        if (window.nfManager) {
            window.nfManager.deleteNetworkFunction(nf.id);
        } else if (window.dataStore) {
            window.dataStore.removeNF(nf.id);
        }

        if (window.canvasRenderer) window.canvasRenderer.render();
    }

    async dockerStart(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker start <service-name>', 'error');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        let nf = allNFs.find(n => n.type === nfType);

        // If NF doesn't exist, create it with position from one-click.json
        if (!nf && window.nfManager && nfType) {
            // Try to get position from one-click.json first
            let position = await this.getPositionFromOneClick(nfType);
            
            // Fallback to auto-position if not found in one-click.json
            if (!position) {
                position = window.nfManager.calculateAutoPosition(nfType, 1);
            }

            nf = window.nfManager.createNetworkFunction(nfType, position);
            if (nf) {
                nf.createdAt = Date.now();
                window.dataStore.updateNF(nf.id, nf);

                // Auto-connect to buses from one-click.json
                await this.autoConnectToBusesFromOneClick(nf);
            }
        }

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        const previousStatus = nf.status;
        this.addTerminalLine(output, `Starting ${nf.name}...`, 'info');

        if (!nf.createdAt) {
            nf.createdAt = Date.now();
        }
        nf.status = 'starting';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        // Add log entry for the start event
        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'INFO', `${nf.name} starting via docker command`, {
                previousStatus: previousStatus,
                newStatus: 'starting',
                command: `docker start ${serviceName}`,
                timestamp: new Date().toISOString()
            });
        }

        setTimeout(() => {
            if (window.dataStore?.getNFById(nf.id)) {
                nf.status = 'stable';
                nf.statusTimestamp = Date.now();
                window.dataStore.updateNF(nf.id, nf);
                
                // Add log entry when service becomes stable
                if (window.logEngine) {
                    window.logEngine.addLog(nf.id, 'SUCCESS', `${nf.name} is now STABLE and ready`, {
                        previousStatus: 'starting',
                        newStatus: 'stable',
                        uptime: '5 seconds'
                    });
                }
                
                if (window.canvasRenderer) {
                    window.canvasRenderer.render();
                }
            }
        }, 5000);

        this.addTerminalLine(output, `✅ ${nf.name} started (status: starting)`, 'success');
        this.addTerminalLine(output, 'Service will be stable in ~5 seconds', 'info');

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }

    /**
     * Stop a specific service
     * @param {string} serviceName - Service name to stop
     * @param {HTMLElement} output - Output element
     */
    async dockerStop(serviceName, output) {
        if (!serviceName) {
            this.addTerminalLine(output, 'Usage: docker stop <service-name>', 'error');
            return;
        }

        const allNFs = window.dataStore?.getAllNFs() || [];
        const serviceNameMap = {
            'oai-amf': 'AMF', 'oai-smf': 'SMF', 'oai-upf': 'UPF', 'oai-ausf': 'AUSF',
            'oai-udm': 'UDM', 'oai-udr': 'UDR', 'oai-nrf': 'NRF', 'oai-pcf': 'PCF',
            'oai-nssf': 'NSSF', 'mysql': 'MySQL', 'ext-dn': 'ext-dn', 'oai-gnb': 'gNB', 'oai-ue': 'UE'
        };

        const nfType = serviceNameMap[serviceName.toLowerCase()];
        const nf = allNFs.find(n => n.type === nfType);

        if (!nf) {
            this.addTerminalLine(output, `Service '${serviceName}' not found.`, 'error');
            return;
        }

        this.addTerminalLine(output, `Stopping ${nf.name}...`, 'info');
        
        // Update status to stopped
        const previousStatus = nf.status;
        nf.status = 'stopped';
        nf.statusTimestamp = Date.now();
        window.dataStore.updateNF(nf.id, nf);

        this.addTerminalLine(output, `✅ ${nf.name} stopped`, 'success');

        // Add log entry for the stop event
        if (window.logEngine) {
            window.logEngine.addLog(nf.id, 'WARNING', `${nf.name} stopped via docker command`, {
                previousStatus: previousStatus,
                newStatus: 'stopped',
                command: `docker stop ${serviceName}`,
                timestamp: new Date().toISOString()
            });
        }

        if (window.canvasRenderer) {
            window.canvasRenderer.render();
        }
    }
    /**
     * Add line to terminal output
     * @param {HTMLElement} output - Output element
     * @param {string} text - Text to add
     * @param {string} type - Line type
     */
    addTerminalLine(output, text, type = 'normal') {
        const line = document.createElement('div');
        line.className = `docker-terminal-line docker-terminal-${type}`;
        line.innerHTML = text || '&nbsp;';
        output.appendChild(line);
        
        // Scroll the content container, not the output element
        const content = document.getElementById('docker-terminal-content');
        if (content) {
            // Use requestAnimationFrame to ensure DOM has updated before scrolling
            requestAnimationFrame(() => {
                content.scrollTop = content.scrollHeight;
            });
        }
    }

    /**
     * Generate container ID
     * @returns {string} Random container ID
     */
    generateContainerId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Get ports for NF
     * @param {Object} nf - Network Function
     * @returns {string} Ports string
     */
    getPortsForNF(nf) {
        const portMap = {
            'AMF': '80/tcp, 8080/tcp, 9090/tcp, 38412/sctp',
            'SMF': '80/tcp, 8080/tcp, 8805/udp',
            'UPF': '2152/udp, 8805/udp',
            'AUSF': '80/tcp, 8080/tcp',
            'UDM': '80/tcp, 8080/tcp',
            'UDR': '80/tcp, 8080/tcp',
            'NRF': '80/tcp, 8080/tcp, 9090/tcp',
            'PCF': '80/tcp, 8080/tcp',
            'NSSF': '80/tcp, 8080/tcp',
            'MySQL': '3306/tcp, 33060/tcp',
            'gNB': '2152/udp, 38412/sctp',
            'UE': '2152/udp'
        };
        return portMap[nf.type] || `${nf.config.port}/tcp`;
    }

    /**
     * Create default NFs as fallback
     * @param {HTMLElement} output - Output element
     */
    async createDefaultNFs(output) {
        const defaultNFs = this.getDefaultNFConfigurations();
        const creationTime = Date.now();

        for (const nfConfig of defaultNFs) {
            this.addTerminalLine(output, `Creating ${nfConfig.type}...`, 'info');

            const position = window.nfManager.calculateAutoPosition(nfConfig.type, 1);
            const nf = window.nfManager.createNetworkFunction(nfConfig.type, position);

            if (nf) {
                nf.config.ipAddress = nfConfig.ipAddress;
                nf.config.port = nfConfig.port;
                nf.config.httpProtocol = nfConfig.httpProtocol || 'HTTP/2';
                nf.createdAt = creationTime;
                window.dataStore.updateNF(nf.id, nf);
                this.addTerminalLine(output, `✅ ${nf.name} created (${nfConfig.ipAddress}:${nfConfig.port})`, 'success');
                await this.delay(200);
            }
        }

        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, `✅ Created ${defaultNFs.length} default Network Functions`, 'success');
    }

    /**
     * Filter topology to exclude gNB and UE
     * @param {Object} topology - Topology object
     * @returns {Object} Filtered topology
     */
    filterTopology(topology) {
        const filtered = JSON.parse(JSON.stringify(topology));

        if (filtered.nfs && Array.isArray(filtered.nfs)) {
            filtered.nfs = filtered.nfs.filter(nf => nf.type !== 'gNB' && nf.type !== 'UE');
        }

        const serviceBusNFIds = new Set();
        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    bus.connections.forEach(nfId => {
                        serviceBusNFIds.add(nfId);
                    });
                }
            });
        }

        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            filtered.busConnections.forEach(busConn => {
                serviceBusNFIds.add(busConn.nfId);
            });
        }

        if (filtered.connections && Array.isArray(filtered.connections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }

            filtered.connections = filtered.connections.filter(conn => {
                if (excludedNFIds.has(conn.sourceId) || excludedNFIds.has(conn.targetId)) {
                    return false;
                }

                const bothOnServiceBus = serviceBusNFIds.has(conn.sourceId) && serviceBusNFIds.has(conn.targetId);
                if (bothOnServiceBus) {
                    const serviceBusInterfaces = ['Nnrf_NFManagement', 'Nnrf_NFDiscovery', 'Nnrf',
                        'Namf', 'Nsmf', 'Nausf', 'Nudm', 'Npcf', 'Nnssf', 'Nudr'];
                    const isServiceBusInterface = serviceBusInterfaces.some(iface =>
                        conn.interfaceName?.includes(iface) || conn.interfaceName === iface);
                    if (isServiceBusInterface) {
                        return false;
                    }
                }
                return true;
            });
        }

        if (filtered.busConnections && Array.isArray(filtered.busConnections)) {
            const excludedNFIds = new Set();
            if (topology.nfs) {
                topology.nfs.forEach(nf => {
                    if (nf.type === 'gNB' || nf.type === 'UE') {
                        excludedNFIds.add(nf.id);
                    }
                });
            }
            filtered.busConnections = filtered.busConnections.filter(busConn => !excludedNFIds.has(busConn.nfId));
        }

        if (filtered.buses && Array.isArray(filtered.buses)) {
            filtered.buses.forEach(bus => {
                if (bus.connections && Array.isArray(bus.connections)) {
                    const excludedNFIds = new Set();
                    if (topology.nfs) {
                        topology.nfs.forEach(nf => {
                            if (nf.type === 'gNB' || nf.type === 'UE') {
                                excludedNFIds.add(nf.id);
                            }
                        });
                    }
                    bus.connections = bus.connections.filter(nfId => !excludedNFIds.has(nfId));
                }
            });
        }

        return filtered;
    }

    /**
     * Get default NF configurations
     * @returns {Array} Array of default NF configurations
     */
    getDefaultNFConfigurations() {
        return [
            { type: 'NRF', ipAddress: '192.168.1.10', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AMF', ipAddress: '192.168.1.20', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'SMF', ipAddress: '192.168.1.30', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UPF', ipAddress: '192.168.1.40', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'AUSF', ipAddress: '192.168.1.50', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDM', ipAddress: '192.168.1.60', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'UDR', ipAddress: '192.168.1.70', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'PCF', ipAddress: '192.168.1.80', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'NSSF', ipAddress: '192.168.1.90', port: 8080, httpProtocol: 'HTTP/2' },
            { type: 'MySQL', ipAddress: '192.168.1.100', port: 3306, httpProtocol: 'HTTP/2' }
        ];
    }

    /**
     * Format creation time for docker ps
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTime(timestamp) {
        if (!timestamp) return '3 weeks ago';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) {
            return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
        } else if (minutes < 60) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (hours < 24) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (days < 7) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (days < 30) {
            const weeks = Math.floor(days / 7);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        } else {
            const months = Math.floor(days / 30);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Format creation time for watch command
     * @param {number} timestamp - Creation timestamp
     * @returns {string} Formatted time string
     */
    formatCreationTimeForWatch(timestamp) {
        if (!timestamp) return 'About a minute ago';
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);

        if (seconds < 30) {
            return 'Just now';
        } else if (seconds < 60) {
            return 'About a minute ago';
        } else if (minutes === 1) {
            return 'About a minute ago';
        } else if (minutes < 60) {
            return `About ${minutes} minutes ago`;
        } else {
            const hours = Math.floor(minutes / 60);
            if (hours === 1) {
                return 'About an hour ago';
            } else if (hours < 24) {
                return `About ${hours} hours ago`;
            } else {
                const days = Math.floor(hours / 24);
                if (days === 1) {
                    return 'About a day ago';
                } else {
                    return `About ${days} days ago`;
                }
            }
        }
    }

    /**
     * Delay helper
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} Promise that resolves after delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Setup window controls (simplified - no drag, resize, or window buttons)
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupWindowControls(terminalModal) {
        const terminalWindow = document.getElementById('docker-terminal-window');
        if (!terminalWindow) return;

        // Don't set position - let flexbox handle centering
        // Remove any inline positioning
        terminalWindow.style.left = '';
        terminalWindow.style.top = '';
        terminalWindow.style.transform = '';

        this.setupDragResizeControls(terminalModal);
    }

    /**
     * Apply saved terminal state (simplified - no state management)
     */
    applyTerminalState() {
        // Simplified - terminal is now a fixed centered modal
        // No state to restore
    }

    /**
     * Save terminal state to localStorage (simplified - no state to save)
     */
    saveTerminalState() {
        // Simplified - no state to save
    }

    /**
     * Setup drag, resize and window button controls
     * @param {HTMLElement} terminalModal - Terminal modal element
     */
    setupDragResizeControls(terminalModal) {
        const terminalWindow = document.getElementById('docker-terminal-window');
        if (!terminalWindow) return;

        const MIN_W = 400, MIN_H = 280;
        let resizing = null;

        terminalWindow.querySelectorAll('.docker-terminal-resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                const rect = terminalWindow.getBoundingClientRect();
                resizing = {
                    startX: e.clientX, 
                    startY: e.clientY,
                    startW: rect.width, 
                    startH: rect.height
                };
                terminalWindow.style.transition = 'none';
                e.preventDefault();
                e.stopPropagation();
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!resizing) return;

            const dx = e.clientX - resizing.startX;
            const dy = e.clientY - resizing.startY;

            // Grow/shrink symmetrically from center — use the larger delta axis
            const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;

            let newW = Math.max(MIN_W, resizing.startW + delta * 2);
            let newH = Math.max(MIN_H, resizing.startH + delta * 2);

            // Constrain to viewport size with padding
            const MAX_W = window.innerWidth - 40;  // 20px padding on each side
            const MAX_H = window.innerHeight - 40; // 20px padding on top and bottom

            newW = Math.min(newW, MAX_W);
            newH = Math.min(newH, MAX_H);

            // Just set width and height - flexbox keeps it centered
            terminalWindow.style.width  = newW + 'px';
            terminalWindow.style.height = newH + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (resizing) {
                resizing = null;
                terminalWindow.style.transition = '';
            }
        });
    }

    /**
     * Minimize terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    minimizeTerminal(terminalWindow) {
        this.terminalState.isMinimized = !this.terminalState.isMinimized;

        if (this.terminalState.isMinimized) {
            terminalWindow.style.height = '35px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'none';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'none';
        } else {
            terminalWindow.style.height = this.terminalState.height + 'px';
            const content = document.getElementById('docker-terminal-content');
            if (content) content.style.display = 'flex';
            const resizeHandle = document.getElementById('docker-terminal-resize-handle');
            if (resizeHandle) resizeHandle.style.display = 'block';
        }

        this.saveTerminalState();
    }

    /**
     * Toggle maximize/restore terminal window
     * @param {HTMLElement} terminalWindow - Terminal window element
     */
    toggleMaximize(terminalWindow) {
        this.terminalState.isMaximized = !this.terminalState.isMaximized;
        const maximizeBtn = document.getElementById('docker-terminal-maximize');

        if (this.terminalState.isMaximized) {
            if (!terminalWindow.style.left) {
                const rect = terminalWindow.getBoundingClientRect();
                this.terminalState.x = rect.left;
                this.terminalState.y = rect.top;
            }

            terminalWindow.style.left = '0';
            terminalWindow.style.top = '0';
            terminalWindow.style.width = '100vw';
            terminalWindow.style.height = '100vh';
            terminalWindow.style.transform = 'none';
            terminalWindow.style.borderRadius = '0';
            if (maximizeBtn) maximizeBtn.textContent = '❐';
        } else {
            terminalWindow.style.width = this.terminalState.width + 'px';
            terminalWindow.style.height = this.terminalState.height + 'px';
            terminalWindow.style.borderRadius = '8px 8px 0 0';

            if (this.terminalState.x !== null && this.terminalState.y !== null) {
                terminalWindow.style.left = this.terminalState.x + 'px';
                terminalWindow.style.top = this.terminalState.y + 'px';
                terminalWindow.style.transform = 'none';
            } else {
                terminalWindow.style.left = '';
                terminalWindow.style.top = '';
                terminalWindow.style.transform = '';
            }

            if (maximizeBtn) maximizeBtn.textContent = '□';
        }

        this.saveTerminalState();
    }

    /**
     * Docker network ls command
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkLS(output) {
        this.addTerminalLine(output, 'NETWORK ID     NAME          DRIVER    SCOPE', 'info');
        this.addTerminalLine(output, 'df33e4a6502d   bridge        bridge    local', 'info');
        this.addTerminalLine(output, '902c1fcc4369   host          host      local', 'info');
        this.addTerminalLine(output, '0c712814bbb0   none          null      local', 'info');

        if (this.oaiWorkshopNetworkExists) {
            this.addTerminalLine(output, `${this.oaiWorkshopNetworkId}   oaiworkshop   bridge    local`, 'success');
        }
    }

    /**
     * Docker network inspect command
     * @param {string} networkName - Network name to inspect
     * @param {HTMLElement} output - Output element
     */
    dockerNetworkInspect(networkName, output) {
        if (networkName === 'bridge') {
            this.inspectBridgeNetwork(output);
        } else if (networkName === 'host') {
            this.inspectHostNetwork(output);
        } else if (networkName === 'none') {
            this.inspectNoneNetwork(output);
        } else if (networkName === 'oaiworkshop') {
            if (this.oaiWorkshopNetworkExists) {
                this.inspectOAIWorkshopNetwork(output);
            } else {
                this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
            }
        } else {
            this.addTerminalLine(output, `Error: No such network: ${networkName}`, 'error');
        }
    }

    /**
     * Inspect bridge network
     * @param {HTMLElement} output - Output element
     */
    inspectBridgeNetwork(output) {
        const json = {
            "Name": "bridge",
            "Id": "df33e4a6502d1229e87fbd225ce8cc4b95fd4553fcaadee50fd5a70a4a021f3d",
            "Created": "2026-01-30T15:26:16.417604705+05:30",
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [{ "Subnet": "172.17.0.0/16", "Gateway": "172.17.0.1" }]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {
                "com.docker.network.bridge.default_bridge": "true",
                "com.docker.network.bridge.enable_icc": "true",
                "com.docker.network.bridge.enable_ip_masquerade": "true",
                "com.docker.network.bridge.host_binding_ipv4": "0.0.0.0",
                "com.docker.network.bridge.name": "docker0",
                "com.docker.network.driver.mtu": "1500"
            },
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect host network
     * @param {HTMLElement} output - Output element
     */
    inspectHostNetwork(output) {
        const json = {
            "Name": "host",
            "Id": "902c1fcc436950abba5007bd8b39b65ab96fd9c72b3873519ebc55bc14315b74",
            "Created": "2026-01-20T15:04:16.397276602+05:30",
            "Scope": "local",
            "Driver": "host",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": { "Driver": "default", "Options": null, "Config": null },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect none network
     * @param {HTMLElement} output - Output element
     */
    inspectNoneNetwork(output) {
        const json = {
            "Name": "none",
            "Id": "0c712814bbb0c32a4d2846f885d90534121f472d0c71d0c34330ad6da8327020",
            "Created": "2026-01-20T15:04:16.389588497+05:30",
            "Scope": "local",
            "Driver": "null",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": { "Driver": "default", "Options": null, "Config": null },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": {},
            "Options": {},
            "Labels": {}
        };
        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Inspect OAI workshop network
     * @param {HTMLElement} output - Output element
     */
    inspectOAIWorkshopNetwork(output) {
        const allNFs = window.dataStore?.getAllNFs() || [];
        const containers = {};

        allNFs.forEach(nf => {
            const serviceNameMap = {
                'AMF': 'oai-amf', 'SMF': 'oai-smf', 'UPF': 'oai-upf', 'AUSF': 'oai-ausf',
                'UDM': 'oai-udm', 'UDR': 'oai-udr', 'NRF': 'oai-nrf', 'PCF': 'oai-pcf',
                'NSSF': 'oai-nssf', 'MySQL': 'mysql', 'ext-dn': 'oai-ext-dn'
            };
            const serviceName = serviceNameMap[nf.type] || nf.type.toLowerCase();
            const containerId = this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'abcd';

            containers[containerId] = {
                "Name": serviceName,
                "EndpointID": this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + this.generateContainerId() + 'ef01',
                "MacAddress": this.generateMacAddress(),
                "IPv4Address": nf.config.ipAddress + "/26",
                "IPv6Address": ""
            };
        });

        const createdTime = this.oaiWorkshopCreatedTime ? new Date(this.oaiWorkshopCreatedTime).toISOString() : new Date().toISOString();

        const json = {
            "Name": "oaiworkshop",
            "Id": this.oaiWorkshopNetworkId + "d0a87f40b563d8172b3f54045b0da9d9b859ed25522c2aaa8b86",
            "Created": createdTime,
            "Scope": "local",
            "Driver": "bridge",
            "EnableIPv4": true,
            "EnableIPv6": false,
            "IPAM": {
                "Driver": "default",
                "Options": null,
                "Config": [{ "Subnet": "192.168.70.0/26" }]
            },
            "Internal": false,
            "Attachable": false,
            "Ingress": false,
            "ConfigFrom": { "Network": "" },
            "ConfigOnly": false,
            "Containers": containers,
            "Options": { "com.docker.network.bridge.name": "oaiworkshop" },
            "Labels": {
                "com.docker.compose.config-hash": "dca0e19cf413805e199db52df7a818f82ffd4a571265d5f722c8e2198676da59",
                "com.docker.compose.network": "public_net",
                "com.docker.compose.project": "cn",
                "com.docker.compose.version": "5.0.1"
            }
        };

        this.addTerminalLine(output, JSON.stringify([json], null, 2), 'info');
    }

    /**
     * Generate network ID
     * @returns {string} Random network ID
     */
    generateNetworkId() {
        const chars = '0123456789abcdef';
        let id = '';
        for (let i = 0; i < 12; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

    /**
     * Generate MAC address
     * @returns {string} Random MAC address
     */
    generateMacAddress() {
        const chars = '0123456789abcdef';
        let mac = '';
        for (let i = 0; i < 6; i++) {
            if (i > 0) mac += ':';
            mac += chars[Math.floor(Math.random() * chars.length)];
            mac += chars[Math.floor(Math.random() * chars.length)];
        }
        return mac;
    }

    /**
     * Docker version command
     * @param {HTMLElement} output - Output element
     */
    dockerVersion(output) {
        this.addTerminalLine(output, 'Client: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Version:           28.0.4', 'info');
        this.addTerminalLine(output, ' API version:       1.48', 'info');
        this.addTerminalLine(output, ' Go version:        go1.23.7', 'info');
        this.addTerminalLine(output, ' Git commit:        b8034c0', 'info');
        this.addTerminalLine(output, ' Built:             Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, ' OS/Arch:           linux/amd64', 'info');
        this.addTerminalLine(output, ' Context:           default', 'info');
        this.addTerminalLine(output, '', 'blank');
        this.addTerminalLine(output, 'Server: Docker Engine - Community', 'info');
        this.addTerminalLine(output, ' Engine:', 'info');
        this.addTerminalLine(output, '  Version:          28.0.4', 'info');
        this.addTerminalLine(output, '  API version:      1.48 (minimum version 1.24)', 'info');
        this.addTerminalLine(output, '  Go version:       go1.23.7', 'info');
        this.addTerminalLine(output, '  Git commit:       6430e49', 'info');
        this.addTerminalLine(output, '  Built:            Tue Mar 25 15:07:11 2025', 'info');
        this.addTerminalLine(output, '  OS/Arch:          linux/amd64', 'info');
        this.addTerminalLine(output, '  Experimental:     false', 'info');
        this.addTerminalLine(output, ' containerd:', 'info');
        this.addTerminalLine(output, '  Version:          v2.2.1', 'info');
        this.addTerminalLine(output, '  GitCommit:        dea7da592f5d1d2b7755e3a161be07f43fad8f75', 'info');
        this.addTerminalLine(output, ' runc:', 'info');
        this.addTerminalLine(output, '  Version:          1.3.4', 'info');
        this.addTerminalLine(output, '  GitCommit:        v1.3.4-0-gd6d73eb8', 'info');
        this.addTerminalLine(output, ' docker-init:', 'info');
        this.addTerminalLine(output, '  Version:          0.19.0', 'info');
        this.addTerminalLine(output, '  GitCommit:        de40ad0', 'info');
    }
}

// Initialize global instance
window.dockerTerminal = new DockerTerminal();
