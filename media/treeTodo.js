//@ts-check

(function () {
    const vscode = acquireVsCodeApi();

    const container = document.getElementById('container');
    const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('connections'));
    const ctx = canvas.getContext('2d');

    /** @type {any} */
    let state = { tasks: [] };

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                const text = message.text;
                if (text) {
                    state = JSON.parse(text);
                } else {
                    state = { tasks: [] };
                }
                render();
                break;
        }
    });

    function updateState() {
        // Enforce rules before saving
        state.tasks.forEach(task => {
            task.items.forEach(item => {
                if (item.linksTo) {
                    const linkedTask = state.tasks.find(t => t.id === item.linksTo);
                    if (linkedTask) {
                        item.title = linkedTask.title;
                    }
                }
            });
        });

        vscode.postMessage({ type: 'update', state });
        render();
    }

    function calculateCompletion(task) {
        if (!task.items || task.items.length === 0) return 0;
        const completedCount = task.items.filter(item => item.completed).length;
        return Math.round((completedCount / task.items.length) * 100);
    }

    function getTaskDepth() {
        const depths = new Map();
        const visited = new Set();

        function setDepth(taskId, depth) {
            const currentDepth = depths.get(taskId) || 0;
            depths.set(taskId, Math.max(currentDepth, depth));

            const task = state.tasks.find(t => t.id === taskId);
            if (task) {
                task.items.forEach(item => {
                    if (item.linksTo) {
                        setDepth(item.linksTo, depth + 1);
                    }
                });
            }
        }

        const allTargetIds = new Set();
        state.tasks.forEach(t => t.items.forEach(i => i.linksTo && allTargetIds.add(i.linksTo)));
        
        state.tasks.forEach(task => {
            if (!allTargetIds.has(task.id)) {
                setDepth(task.id, 0);
            }
        });

        return depths;
    }

    function render() {
        container.innerHTML = '';
        const depths = getTaskDepth();
        const maxDepth = Math.max(0, ...Array.from(depths.values()));

        const columns = [];
        for (let i = 0; i <= maxDepth; i++) {
            const colDiv = document.createElement('div');
            colDiv.className = 'column';
            colDiv.dataset.depth = i.toString();
            columns.push(colDiv);
            container.appendChild(colDiv);
        }

        // Sort tasks within columns based on parent item order if possible
        // For simplicity, we'll just group them for now.
        state.tasks.forEach(task => {
            const depth = depths.get(task.id) || 0;
            const card = createCard(task);
            columns[depth].appendChild(card);
        });

        requestAnimationFrame(drawConnections);
    }

    function createCard(task) {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `card-${task.id}`;
        card.dataset.taskId = task.id;

        const header = document.createElement('div');
        header.className = 'card-header';
        header.innerHTML = `<span class="icon">📋</span> <span class="title">${task.title}</span>`;
        card.appendChild(header);

        if (Array.from(getTaskDepth().values()).some(d => d > 0)) { // If not a root-only view
             const inPort = document.createElement('div');
             inPort.className = 'in-port';
             card.appendChild(inPort);
        }

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'card-items';
        task.items.forEach((item, index) => {
            const itemRow = document.createElement('div');
            itemRow.className = 'item-row';
            itemRow.draggable = true;
            itemRow.dataset.index = index.toString();

            const itemDiv = document.createElement('div');
            itemDiv.className = 'item';
            
            const toggle = document.createElement('div');
            toggle.className = `item-toggle ${item.completed ? 'completed' : ''}`;
            toggle.onclick = () => {
                item.completed = !item.completed;
                updateState();
            };

            const title = document.createElement('div');
            title.className = 'item-title';
            title.textContent = item.title;

            itemDiv.appendChild(toggle);
            itemDiv.appendChild(title);
            itemRow.appendChild(itemDiv);

            if (item.linksTo) {
                const port = document.createElement('div');
                port.className = 'port item-port';
                port.id = `port-${task.id}-${item.id}`;
                itemRow.appendChild(port);
            }

            // Drag and Drop
            itemRow.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ taskId: task.id, index }));
                itemRow.classList.add('dragging');
            };
            itemRow.ondragend = () => itemRow.classList.remove('dragging');
            itemRow.ondragover = (e) => e.preventDefault();
            itemRow.ondrop = (e) => {
                e.preventDefault();
                const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                if (data.taskId === task.id) {
                    const fromIndex = data.index;
                    const toIndex = index;
                    const [movedItem] = task.items.splice(fromIndex, 1);
                    task.items.splice(toIndex, 0, movedItem);
                    updateState();
                }
            };

            itemsContainer.appendChild(itemRow);
        });
        card.appendChild(itemsContainer);

        const progress = calculateCompletion(task);
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';
        progressContainer.innerHTML = `
            <span>${progress}%</span>
            <div class="circular-progress">
                <svg viewBox="0 0 36 36">
                    <circle class="bg" cx="18" cy="18" r="16"></circle>
                    <circle class="fg" cx="18" cy="18" r="16" style="stroke-dashoffset: ${100 - progress}"></circle>
                </svg>
            </div>
        `;
        card.appendChild(progressContainer);

        return card;
    }

    function drawConnections() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;

        state.tasks.forEach(task => {
            task.items.forEach(item => {
                if (item.linksTo) {
                    const fromPort = document.getElementById(`port-${task.id}-${item.id}`);
                    const toCard = document.getElementById(`card-${item.linksTo}`);
                    
                    if (fromPort && toCard) {
                        const fromRect = fromPort.getBoundingClientRect();
                        const toPort = toCard.querySelector('.in-port');
                        if (!toPort) return;
                        const toRect = toPort.getBoundingClientRect();

                        const startX = fromRect.left + fromRect.width / 2;
                        const startY = fromRect.top + fromRect.height / 2;
                        const endX = toRect.left + toRect.width / 2;
                        const endY = toRect.top + toRect.height / 2;

                        const cp1x = startX + (endX - startX) / 2;
                        const cp1y = startY;
                        const cp2x = startX + (endX - startX) / 2;
                        const cp2y = endY;

                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
                        ctx.stroke();

                        // Draw arrow head or dot at the end
                        ctx.fillStyle = 'white';
                        ctx.beginPath();
                        ctx.arc(endX, endY, 4, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.beginPath();
                        ctx.arc(startX, startY, 4, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            });
        });
    }

    window.addEventListener('resize', () => {
        requestAnimationFrame(drawConnections);
    });

    // Handle container scroll for canvas redrawing
    container.addEventListener('scroll', () => {
        requestAnimationFrame(drawConnections);
    });

})();
