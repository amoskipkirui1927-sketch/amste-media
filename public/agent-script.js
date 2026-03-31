// agent-script.js – Admin dashboard with production-ready code
// Updated with proper error handling and socket management

let currentAgent = null;
let notificationContainer = null;
let activeTab = 'dashboardPage';
let currentChatCustomerId = null;
let currentReportOrders = [];
let profitChart = null;
let currentProfitPeriod = 'daily';

document.addEventListener('DOMContentLoaded', () => {
    createNotificationContainer();
    checkAgentLogin();
    setupAgentEventListeners();

    if (socket) {
        socket.on('connect', () => {
            console.log('Admin socket connected');
            if (currentAgent) {
                refreshCurrentPage();
            }
        });
        
        socket.on('orderUpdate', (order) => { 
            if (currentAgent) {
                refreshCurrentPage();
                showNotification(`Order #${order.id.slice(-8)} updated: ${order.status}`, 'info');
            }
        });
        
        socket.on('newMessage', (message) => { 
            if (currentAgent && activeTab === 'customerMessagesPage') {
                loadCustomerMessages();
                if (currentChatCustomerId && (message.senderId === currentChatCustomerId || message.recipientId === currentChatCustomerId)) {
                    selectConversation(currentChatCustomerId);
                }
            }
            updateUnattendedBadges();
            if (message.senderType === 'customer') {
                showNotification(`New message from customer`, 'info');
            }
        });
        
        socket.on('messageDeleted', () => { 
            if (activeTab === 'customerMessagesPage') {
                loadCustomerMessages();
                if (currentChatCustomerId) selectConversation(currentChatCustomerId);
            }
            updateUnattendedBadges(); 
        });
        
        socket.on('notification', (notification) => {
            if (currentAgent) {
                showNotification(notification.message, notification.type);
            }
        });
    }
});

function createNotificationContainer() {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:350px;width:100%;';
    document.body.appendChild(notificationContainer);
}

function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `background: white; border-left: 4px solid ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'}; padding: 1rem; margin-bottom: 10px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); animation: slideInRight 0.3s ease; display: flex; justify-content: space-between; align-items: center; cursor: pointer;`;
    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
    const color = type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8';
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas ${icon}" style="color: ${color};"></i>
            <span>${escapeHtml(message)}</span>
        </div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; font-size: 1.2rem;">&times;</button>
    `;
    notificationContainer.appendChild(notification);
    setTimeout(() => {
        if (notification.parentElement) notification.remove();
    }, duration);
}

async function apiCall(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            headers: { 'Content-Type': 'application/json', ...options.headers },
            ...options
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

async function updateUnattendedBadges() {
    if (!currentAgent) return;
    try {
        const data = await apiCall('/admin/unattended-count');
        const reviewBadge = document.getElementById('reviewBadge');
        const messagesBadge = document.getElementById('messagesBadge');
        const dashboardBadge = document.getElementById('dashboardBadge');
        
        if (data.pendingReview > 0) {
            reviewBadge.textContent = data.pendingReview;
            reviewBadge.style.display = 'inline-block';
            dashboardBadge.textContent = data.pendingReview;
            dashboardBadge.style.display = 'inline-block';
        } else {
            reviewBadge.style.display = 'none';
            if (data.unreadMessages === 0) dashboardBadge.style.display = 'none';
        }
        
        if (data.unreadMessages > 0) {
            messagesBadge.textContent = data.unreadMessages;
            messagesBadge.style.display = 'inline-block';
            if (data.pendingReview === 0) {
                dashboardBadge.textContent = data.unreadMessages;
                dashboardBadge.style.display = 'inline-block';
            }
        } else {
            messagesBadge.style.display = 'none';
        }
    } catch (err) {
        console.error('Failed to update badges:', err);
    }
}

async function checkAgentLogin() {
    const stored = localStorage.getItem('currentAgent');
    if (stored) {
        try {
            currentAgent = JSON.parse(stored);
            document.getElementById('adminLoginContainer')?.remove();
            document.querySelector('.agent-dashboard')?.classList.remove('hidden');
            loadDashboard();
            updateUnattendedBadges();
            setInterval(updateUnattendedBadges, 30000);
        } catch (error) {
            console.error('Error parsing stored agent:', error);
            localStorage.removeItem('currentAgent');
            showAgentLoginModal();
        }
    } else {
        showAgentLoginModal();
    }
}

function showAgentLoginModal() {
    const modalHtml = `<div id="adminLoginContainer" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;"><div class="modal-content" style="max-width:400px;"><div class="modal-header"><h3>Admin Login</h3></div><div class="modal-body"><form id="agentLoginForm"><div class="form-group"><label>Email</label><input type="email" id="agentEmail" required></div><div class="form-group"><label>Password</label><input type="password" id="agentPassword" required></div><button type="submit" class="btn-primary" style="width:100%">Login</button></form></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('agentLoginForm').addEventListener('submit', handleAgentLogin);
}

async function handleAgentLogin(e) {
    e.preventDefault();
    const email = document.getElementById('agentEmail').value;
    const password = document.getElementById('agentPassword').value;
    try {
        const data = await apiCall('/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        currentAgent = data.agent;
        localStorage.setItem('currentAgent', JSON.stringify(currentAgent));
        location.reload();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

function setupAgentEventListeners() {
    document.querySelectorAll('.sidebar nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            if (page) {
                activeTab = page;
                showPage(page);
                document.querySelectorAll('.sidebar nav a').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            }
        });
    });
}

function showPage(page) {
    ['dashboardPage','reviewOrdersPage','activeOrdersPage','pricingPage','usersPage','reportsPage','customerMessagesPage'].forEach(p => {
        const el = document.getElementById(p);
        if (el) el.style.display = 'none';
    });
    document.getElementById(page).style.display = 'block';
    switch(page) {
        case 'dashboardPage': loadDashboard(); break;
        case 'reviewOrdersPage': loadPendingReviewOrders(); break;
        case 'activeOrdersPage': loadActiveOrders(); break;
        case 'pricingPage': loadPricing(); break;
        case 'usersPage': loadUsers(); break;
        case 'reportsPage': loadReports(); break;
        case 'customerMessagesPage': loadCustomerMessages(); break;
    }
}

function refreshCurrentPage() {
    if (activeTab === 'dashboardPage') loadDashboard();
    else if (activeTab === 'reviewOrdersPage') loadPendingReviewOrders();
    else if (activeTab === 'activeOrdersPage') loadActiveOrders();
    else if (activeTab === 'usersPage') loadUsers();
    else if (activeTab === 'customerMessagesPage') loadCustomerMessages();
    updateUnattendedBadges();
}

async function loadDashboard() {
    try {
        const stats = await apiCall('/admin/stats');
        document.getElementById('statsCards').innerHTML = `
            <div class="stat-card"><h3>${stats.totalOrders}</h3><p>Total Orders</p></div>
            <div class="stat-card"><h3>${stats.completedOrders}</h3><p>Completed</p></div>
            <div class="stat-card"><h3>Ksh ${stats.totalRevenue}</h3><p>Revenue</p></div>
            <div class="stat-card"><h3>${stats.pendingReview}</h3><p>Pending Review</p></div>
            <div class="stat-card"><h3>${stats.awaitingPayment}</h3><p>Awaiting Payment</p></div>
            <div class="stat-card"><h3>${stats.activeOrders}</h3><p>Active Orders</p></div>
        `;
        const orders = await apiCall('/admin/orders');
        displayOrdersTable(orders.slice(0,10), 'recentOrdersTable', false);
        await loadProfitAnalytics();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Failed to load dashboard', 'error');
    }
}

// ---------- Profit & Loss Analytics ----------
async function loadProfitAnalytics() {
    await loadProfitData(currentProfitPeriod);
}

async function loadProfitData(period) {
    currentProfitPeriod = period;
    try {
        const data = await apiCall(`/admin/profit-analytics?period=${period}`);
        updateProfitChart(data);
        updateProfitInterpretation(data);
    } catch (err) {
        console.error('Failed to load profit data:', err);
        showNotification('Failed to load profit analytics', 'error');
    }
}

function updateProfitChart(data) {
    const ctx = document.getElementById('profitChart').getContext('2d');
    
    if (profitChart) {
        profitChart.destroy();
    }
    
    profitChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: 'Revenue (Ksh)',
                    data: data.revenue,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Expenses (Ksh)',
                    data: data.expenses,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Profit (Ksh)',
                    data: data.profit,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += 'Ksh ' + context.raw.toLocaleString();
                            return label;
                        }
                    }
                },
                legend: {
                    position: 'top',
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return 'Ksh ' + value.toLocaleString();
                        }
                    },
                    title: {
                        display: true,
                        text: 'Amount (Ksh)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: getXAxisLabel()
                    }
                }
            }
        }
    });
}

function getXAxisLabel() {
    switch(currentProfitPeriod) {
        case 'daily': return 'Days (Last 30 Days)';
        case 'weekly': return 'Weeks (Last 12 Weeks)';
        case 'monthly': return 'Months (Last 12 Months)';
        case 'quarterly': return 'Quarters';
        case 'halfYearly': return 'Half Years';
        case 'yearly': return 'Years';
        default: return 'Period';
    }
}

function updateProfitInterpretation(data) {
    const container = document.getElementById('profitInterpretation');
    if (!container) return;
    
    const totalRevenue = data.revenue.reduce((a,b) => a + b, 0);
    const totalExpenses = data.expenses.reduce((a,b) => a + b, 0);
    const totalProfit = data.profit.reduce((a,b) => a + b, 0);
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(2) : 0;
    
    const lastPeriodRevenue = data.revenue[data.revenue.length - 1] || 0;
    const previousPeriodRevenue = data.revenue[data.revenue.length - 2] || lastPeriodRevenue;
    const revenueChange = previousPeriodRevenue > 0 ? ((lastPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue * 100).toFixed(1) : 0;
    
    const lastPeriodProfit = data.profit[data.profit.length - 1] || 0;
    const previousPeriodProfit = data.profit[data.profit.length - 2] || lastPeriodProfit;
    const profitChange = previousPeriodProfit > 0 ? ((lastPeriodProfit - previousPeriodProfit) / previousPeriodProfit * 100).toFixed(1) : 0;
    
    let performanceStatus = '';
    let performanceColor = '';
    let performanceIcon = '';
    let performanceMessage = '';
    
    if (profitMargin >= 30) {
        performanceStatus = 'Excellent';
        performanceColor = '#28a745';
        performanceIcon = 'fa-trophy';
        performanceMessage = 'Your business is performing exceptionally well with high profit margins.';
    } else if (profitMargin >= 20) {
        performanceStatus = 'Good';
        performanceColor = '#17a2b8';
        performanceIcon = 'fa-thumbs-up';
        performanceMessage = 'Healthy profit margins. Consider strategies to optimize further.';
    } else if (profitMargin >= 10) {
        performanceStatus = 'Moderate';
        performanceColor = '#ffc107';
        performanceIcon = 'fa-chart-line';
        performanceMessage = 'Moderate profit margins. Look for cost reduction opportunities.';
    } else {
        performanceStatus = 'Needs Attention';
        performanceColor = '#dc3545';
        performanceIcon = 'fa-exclamation-triangle';
        performanceMessage = 'Profit margins are low. Review pricing strategy and operational costs.';
    }
    
    container.innerHTML = `
        <div class="interpretation-summary">
            <div class="interpretation-card" style="border-left-color: ${performanceColor};">
                <div class="interpretation-header">
                    <i class="fas ${performanceIcon}" style="color: ${performanceColor};"></i>
                    <span class="performance-status" style="color: ${performanceColor};">${performanceStatus}</span>
                </div>
                <p class="performance-message">${performanceMessage}</p>
            </div>
            
            <div class="interpretation-stats">
                <div class="interpretation-stat">
                    <div class="stat-label">Total Revenue</div>
                    <div class="stat-value">Ksh ${totalRevenue.toLocaleString()}</div>
                </div>
                <div class="interpretation-stat">
                    <div class="stat-label">Total Expenses</div>
                    <div class="stat-value">Ksh ${totalExpenses.toLocaleString()}</div>
                </div>
                <div class="interpretation-stat">
                    <div class="stat-label">Total Profit</div>
                    <div class="stat-value" style="color: ${totalProfit >= 0 ? '#28a745' : '#dc3545'};">Ksh ${totalProfit.toLocaleString()}</div>
                </div>
                <div class="interpretation-stat">
                    <div class="stat-label">Profit Margin</div>
                    <div class="stat-value" style="color: ${profitMargin >= 20 ? '#28a745' : profitMargin >= 10 ? '#ffc107' : '#dc3545'};">${profitMargin}%</div>
                </div>
            </div>
            
            <div class="interpretation-trends">
                <h4><i class="fas fa-chart-line"></i> Recent Trends</h4>
                <div class="trend-item">
                    <span>Revenue Trend:</span>
                    <span class="${revenueChange >= 0 ? 'trend-positive' : 'trend-negative'}">
                        <i class="fas ${revenueChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                        ${Math.abs(revenueChange)}% vs previous period
                    </span>
                </div>
                <div class="trend-item">
                    <span>Profit Trend:</span>
                    <span class="${profitChange >= 0 ? 'trend-positive' : 'trend-negative'}">
                        <i class="fas ${profitChange >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i>
                        ${Math.abs(profitChange)}% vs previous period
                    </span>
                </div>
            </div>
            
            <div class="interpretation-insights">
                <h4><i class="fas fa-lightbulb"></i> Key Insights</h4>
                <ul>
                    <li>${getBestPerformingPeriodInsight(data)}</li>
                    <li>${getWorstPerformingPeriodInsight(data)}</li>
                    <li>${getExpenseInsight(data)}</li>
                </ul>
            </div>
        </div>
    `;
}

function getBestPerformingPeriodInsight(data) {
    const maxProfitIndex = data.profit.indexOf(Math.max(...data.profit));
    if (maxProfitIndex >= 0) {
        return `<strong>Best Period:</strong> ${data.labels[maxProfitIndex]} had the highest profit of Ksh ${data.profit[maxProfitIndex].toLocaleString()}`;
    }
    return `<strong>Best Period:</strong> No profit data available yet.`;
}

function getWorstPerformingPeriodInsight(data) {
    const minProfitIndex = data.profit.indexOf(Math.min(...data.profit));
    if (minProfitIndex >= 0 && data.profit[minProfitIndex] < 0) {
        return `<strong>Worst Period:</strong> ${data.labels[minProfitIndex]} had a loss of Ksh ${Math.abs(data.profit[minProfitIndex]).toLocaleString()}`;
    } else if (minProfitIndex >= 0) {
        return `<strong>Lowest Profit:</strong> ${data.labels[minProfitIndex]} had the lowest profit of Ksh ${data.profit[minProfitIndex].toLocaleString()}`;
    }
    return `<strong>Lowest Profit:</strong> No profit data available yet.`;
}

function getExpenseInsight(data) {
    const totalRevenue = data.revenue.reduce((a,b) => a + b, 0);
    const totalExpenses = data.expenses.reduce((a,b) => a + b, 0);
    const expenseRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue * 100).toFixed(1) : 0;
    
    if (expenseRatio > 70) {
        return `<strong>High Operating Costs:</strong> ${expenseRatio}% of revenue goes to expenses. Consider cost-cutting measures.`;
    } else if (expenseRatio > 50) {
        return `<strong>Moderate Operating Costs:</strong> ${expenseRatio}% of revenue goes to expenses. Room for optimization.`;
    } else {
        return `<strong>Efficient Operations:</strong> Only ${expenseRatio}% of revenue goes to expenses. Great cost management!`;
    }
}

function changeProfitPeriod(period) {
    currentProfitPeriod = period;
    loadProfitData(period);
    
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.period === period) {
            btn.classList.add('active');
        }
    });
}

function printProfitChart() {
    const chartContainer = document.getElementById('profitAnalyticsContainer');
    const originalContent = chartContainer.innerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Profit & Loss Report - Amste Print Media</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .print-header { text-align: center; margin-bottom: 20px; }
                .print-header h1 { color: #667eea; }
                .print-date { color: #666; font-size: 12px; }
                canvas { max-width: 100%; height: auto; }
                .interpretation-summary { margin-top: 20px; }
                .interpretation-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 15px 0; }
                .interpretation-stat { padding: 10px; background: #f8f9fa; border-radius: 8px; text-align: center; }
                .trend-item { margin: 5px 0; }
                .trend-positive { color: #28a745; }
                .trend-negative { color: #dc3545; }
                @media print {
                    body { margin: 0; padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1><i class="fas fa-chart-line"></i> Amste Print Media</h1>
                <h2>Profit & Loss Report</h2>
                <p class="print-date">Generated: ${new Date().toLocaleString()}</p>
                <p>Period: ${currentProfitPeriod.toUpperCase()}</p>
            </div>
            <div id="printChartContainer">
                <canvas id="printChart" width="800" height="400"></canvas>
            </div>
            <div id="printInterpretation">
                ${document.getElementById('profitInterpretation').innerHTML}
            </div>
            <div class="print-footer" style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
                <p>Amste Print Media - Official Profit & Loss Report</p>
            </div>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
            <script>
                const chartData = ${JSON.stringify(profitChart.data)};
                const ctx = document.getElementById('printChart').getContext('2d');
                new Chart(ctx, {
                    type: 'line',
                    data: chartData,
                    options: ${JSON.stringify(profitChart.options)}
                });
                setTimeout(() => {
                    window.print();
                }, 500);
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

async function loadPendingReviewOrders() {
    try {
        const orders = await apiCall('/admin/orders/pending');
        const container = document.getElementById('pendingReviewList');
        if (!container) return;
        if (orders.length === 0) { container.innerHTML = '<p>No orders pending review.</p>'; return; }
        container.innerHTML = orders.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">Order #${order.id.slice(-8)}</span>
                    <span class="order-status status-pending">PENDING REVIEW</span>
                </div>
                <div class="order-details">
                    <div><strong>Customer:</strong> ${escapeHtml(order.customerName)}</div>
                    <div><strong>Email:</strong> ${escapeHtml(order.customerEmail)}</div>
                    <div><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</div>
                    <div><strong>Print Type:</strong> ${order.settings.printType === 'bw' ? 'Black & White' : 'Color'}</div>
                    <div><strong>Copies:</strong> ${order.settings.copies}</div>
                    <div><strong>Files:</strong> ${order.files.length} file(s)</div>
                </div>
                <div class="order-actions">
                    ${order.files.map((file, idx) => `<button class="btn-action btn-primary" onclick="downloadFile('${order.id}', ${idx})"><i class="fas fa-download"></i> ${escapeHtml(file.name)}</button>`).join('')}
                    <button class="btn-action btn-success" onclick="showConfirmPageModal('${order.id}')">Confirm Pages & Cost</button>
                    <button class="btn-action btn-danger" onclick="cancelOrder('${order.id}')">Cancel Order</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading pending orders:', error);
        showNotification('Failed to load pending orders', 'error');
    }
}

async function downloadFile(orderId, fileIndex) {
    window.open(`${API_BASE}/orders/${orderId}/file/${fileIndex}`, '_blank');
}

async function showConfirmPageModal(orderId) {
    try {
        const orders = await apiCall('/admin/orders');
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        const pricing = await apiCall('/pricing');
        
        const modalHtml = `
            <div id="confirmPageModal" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>Confirm Page Count & Final Cost</h3>
                        <span class="close" onclick="closeModal('confirmPageModal')">&times;</span>
                    </div>
                    <div class="modal-body">
                        <p><strong>Order #${order.id.slice(-8)}</strong></p>
                        <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
                        <div class="form-group">
                            <label>Number of Pages (for documents)</label>
                            <input type="number" id="finalPageCount" min="1" value="1">
                        </div>
                        <div id="calculatedCost" style="background: #e8f0fe; padding: 1rem; border-radius: 8px; margin: 1rem 0;"></div>
                        <button class="btn-primary" onclick="confirmPageCountAndCost('${order.id}')" style="width: 100%;">Confirm & Proceed to Payment</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('finalPageCount').addEventListener('input', () => recalcCost(order, pricing));
        recalcCost(order, pricing);
    } catch (error) {
        console.error('Error showing confirm page modal:', error);
        showNotification('Failed to load order details', 'error');
    }
}

function recalcCost(order, pricing) {
    const pageCount = parseInt(document.getElementById('finalPageCount').value) || 0;
    const copies = order.settings.copies;
    const pricePerPage = order.settings.printType === 'bw' ? pricing.blackWhite : pricing.color;
    let printingCost = pageCount * pricePerPage * copies;
    
    let imageCost = 0;
    if (order.files) {
        imageCost = order.files.filter(f => f.fileType === 'image').length * pricing.imagePrint * copies;
    }
    
    let total = printingCost + imageCost;
    
    document.getElementById('calculatedCost').innerHTML = `
        <strong>Calculated Cost: Ksh ${total}</strong><br>
        Printing: ${pageCount} pages × ${pricePerPage} × ${copies} = Ksh ${printingCost}<br>
        ${imageCost > 0 ? `Images: ${order.files.filter(f => f.fileType === 'image').length} images × ${pricing.imagePrint} × ${copies} = Ksh ${imageCost}<br>` : ''}
    `;
}

async function confirmPageCountAndCost(orderId) {
    const pageCount = parseInt(document.getElementById('finalPageCount').value);
    if (!pageCount) return showNotification('Enter page count', 'error');
    
    try {
        const data = await apiCall(`/admin/orders/${orderId}/confirm-pages`, { 
            method: 'POST', 
            body: JSON.stringify({ finalPageCount: pageCount }) 
        });
        showNotification(`Order confirmed! Final cost: Ksh ${data.finalCost}`, 'success');
        closeModal('confirmPageModal');
        loadPendingReviewOrders();
        loadDashboard();
        updateUnattendedBadges();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function loadActiveOrders() {
    try {
        const orders = await apiCall('/admin/orders');
        const active = orders.filter(o => !['pending_admin_review','awaiting_payment','completed','cancelled'].includes(o.status));
        const container = document.getElementById('activeOrdersList');
        if (!container) return;
        if (active.length === 0) { container.innerHTML = '<p>No active orders.</p>'; return; }
        container.innerHTML = active.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">Order #${order.id.slice(-8)}</span>
                    <span class="order-status status-${order.status}">${order.status.toUpperCase()}</span>
                </div>
                <div class="order-details">
                    <div><strong>Customer:</strong> ${escapeHtml(order.customerName)}</div>
                    <div><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</div>
                    <div><strong>Final Cost:</strong> Ksh ${order.finalCost || 0}</div>
                    <div><strong>Pages:</strong> ${order.settings.finalPageCount || '?'}</div>
                    <div><strong>Copies:</strong> ${order.settings.copies}</div>
                </div>
                <div class="order-actions">
                    <select id="statusSelect-${order.id}" class="btn-action">
                        <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
                        <option value="printing" ${order.status === 'printing' ? 'selected' : ''}>Printing</option>
                        <option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Ready</option>
                        <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                    <button class="btn-action btn-primary" onclick="updateOrderStatus('${order.id}')">Update Status</button>
                    <button class="btn-action btn-danger" onclick="cancelOrder('${order.id}')">Cancel</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading active orders:', error);
        showNotification('Failed to load active orders', 'error');
    }
}

async function updateOrderStatus(orderId) {
    const newStatus = document.getElementById(`statusSelect-${orderId}`).value;
    try {
        await apiCall(`/admin/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
        showNotification(`Order status updated to ${newStatus}`, 'success');
        loadActiveOrders();
        loadDashboard();
    } catch (error) {
        showNotification('Failed to update order status', 'error');
    }
}

function showConfirmDialog(message, onConfirm) {
    const dialog = document.getElementById('customConfirmDialog');
    const messageEl = document.getElementById('confirmMessage');
    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');
    
    messageEl.textContent = message;
    dialog.style.display = 'flex';
    
    const handleYes = () => {
        dialog.style.display = 'none';
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        onConfirm(true);
    };
    
    const handleNo = () => {
        dialog.style.display = 'none';
        yesBtn.removeEventListener('click', handleYes);
        noBtn.removeEventListener('click', handleNo);
        onConfirm(false);
    };
    
    yesBtn.addEventListener('click', handleYes);
    noBtn.addEventListener('click', handleNo);
}

async function cancelOrder(orderId) {
    showConfirmDialog('Are you sure you want to cancel this order?', async (confirmed) => {
        if (!confirmed) return;
        try {
            await apiCall(`/admin/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
            showNotification('Order cancelled', 'success');
            loadPendingReviewOrders();
            loadActiveOrders();
            loadDashboard();
            updateUnattendedBadges();
        } catch (error) {
            showNotification('Failed to cancel order', 'error');
        }
    });
}

function displayOrdersTable(orders, containerId, showActions) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (orders.length === 0) { container.innerHTML = '<p>No orders found.</p>'; return; }
    container.innerHTML = `
        <table>
            <thead>
                <tr><th>Order ID</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
                ${orders.map(o => `
                    <tr>
                        <td>#${o.id.slice(-8)}</td>
                        <td>${escapeHtml(o.customerName)}</td>
                        <td>${escapeHtml(o.customerPhone)}</td>
                        <td>Ksh ${o.finalCost || 0}</td>
                        <td><span class="order-status status-${o.status.replace(/_/g, '-')}">${o.status}</span></td>
                        <td>${new Date(o.createdAt).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadPricing() {
    try {
        const pricing = await apiCall('/pricing');
        const container = document.getElementById('pricingList');
        container.innerHTML = `
            <table>
                <thead>
                    <tr><th>Service</th><th>Current Price (Ksh)</th><th>Update</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Black & White</td>
                        <td>${pricing.blackWhite}</td>
                        <td><input type="number" id="blackWhite" value="${pricing.blackWhite}" style="width: 100px;"><button class="btn-edit" onclick="updatePricing('blackWhite')">Update</button></td>
                    </tr>
                    <tr>
                        <td>Color</td>
                        <td>${pricing.color}</td>
                        <td><input type="number" id="color" value="${pricing.color}" style="width: 100px;"><button class="btn-edit" onclick="updatePricing('color')">Update</button></td>
                    </tr>
                    <tr>
                        <td>Image Print</td>
                        <td>${pricing.imagePrint}</td>
                        <td><input type="number" id="imagePrint" value="${pricing.imagePrint}" style="width: 100px;"><button class="btn-edit" onclick="updatePricing('imagePrint')">Update</button></td>
                    </tr>
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading pricing:', error);
        showNotification('Failed to load pricing', 'error');
    }
}

async function updatePricing(service) {
    const price = parseFloat(document.getElementById(service).value);
    try {
        await apiCall('/admin/pricing', { method: 'POST', body: JSON.stringify({ [service]: price }) });
        showNotification('Pricing updated', 'success');
    } catch (error) {
        showNotification('Failed to update pricing', 'error');
    }
}

async function loadUsers() {
    try {
        const users = await apiCall('/admin/users');
        const container = document.getElementById('usersTable');
        container.innerHTML = `
            <table>
                <thead>
                    <tr><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    ${users.map(u => `
                        <tr>
                            <td>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)}</td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>${escapeHtml(u.phone)}</td>
                            <td>${u.suspended ? '<span style="color: red;">Suspended</span>' : '<span style="color: green;">Active</span>'}</td>
                            <td>
                                <button class="btn-${u.suspended ? 'activate' : 'suspend'}" onclick="toggleUserStatus('${u.id}')">${u.suspended ? 'Activate' : 'Suspend'}</button>
                                <button class="btn-delete" onclick="deleteUser('${u.id}')">Delete</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('Error loading users:', error);
        showNotification('Failed to load users', 'error');
    }
}

async function toggleUserStatus(userId) {
    showConfirmDialog('Are you sure you want to change this user\'s status?', async (confirmed) => {
        if (!confirmed) return;
        try {
            const data = await apiCall(`/admin/users/${userId}/toggle-suspend`, { method: 'PUT' });
            showNotification(`User ${data.suspended ? 'suspended' : 'activated'}`, 'success');
            loadUsers();
        } catch (error) {
            showNotification('Failed to update user status', 'error');
        }
    });
}

async function deleteUser(userId) {
    showConfirmDialog('Are you sure you want to delete this user? This action cannot be undone.', async (confirmed) => {
        if (!confirmed) return;
        try {
            await apiCall(`/admin/users/${userId}`, { method: 'DELETE' });
            showNotification('User deleted', 'success');
            loadUsers();
        } catch (error) {
            showNotification('Failed to delete user', 'error');
        }
    });
}

// Customer Messages
async function loadCustomerMessages() {
    try {
        const convs = await apiCall('/admin/conversations');
        const container = document.getElementById('customerMessagesList');
        if (convs.length === 0) { container.innerHTML = '<p>No conversations yet.</p>'; return; }
        container.innerHTML = convs.map(c => `
            <div class="conversation-item" onclick="selectConversation('${c.customerId}')" style="background: ${c.unreadCount > 0 ? '#e8f0fe' : 'transparent'};">
                <strong>${escapeHtml(c.customerName)}</strong>
                ${c.unreadCount > 0 ? `<span class="badge" style="background: red; margin-left: 0.5rem; display: inline-block; position: static;">${c.unreadCount}</span>` : ''}
                <div><small>📞 ${escapeHtml(c.customerPhone)}</small></div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading customer messages:', error);
        showNotification('Failed to load messages', 'error');
    }
}

function showBroadcastModal() {
    loadUsersForBroadcast();
    document.getElementById('broadcastModal').style.display = 'flex';
}

function closeBroadcastModal() {
    document.getElementById('broadcastModal').style.display = 'none';
}

async function loadUsersForBroadcast() {
    try {
        const users = await apiCall('/admin/users');
        const container = document.getElementById('userCheckboxList');
        container.innerHTML = users.map(u => `
            <div class="user-checkbox-item">
                <input type="checkbox" id="user_${u.id}" value="${u.id}">
                <label for="user_${u.id}">${escapeHtml(u.firstName)} ${escapeHtml(u.lastName)} (${escapeHtml(u.email)})</label>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading users for broadcast:', error);
        showNotification('Failed to load users', 'error');
    }
}

async function sendBroadcast() {
    const checkboxes = document.querySelectorAll('#userCheckboxList input[type="checkbox"]:checked');
    const recipientIds = Array.from(checkboxes).map(cb => cb.value);
    const content = document.getElementById('broadcastMessage').value.trim();
    if (recipientIds.length === 0) return showNotification('Select at least one user', 'error');
    if (!content) return showNotification('Enter message', 'error');
    try {
        await apiCall('/admin/broadcast', { method: 'POST', body: JSON.stringify({ recipientIds, content }) });
        showNotification(`Broadcast sent to ${recipientIds.length} users`, 'success');
        document.getElementById('broadcastMessage').value = '';
        checkboxes.forEach(cb => cb.checked = false);
        closeBroadcastModal();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function selectConversation(customerId) {
    currentChatCustomerId = customerId;
    try {
        const convs = await apiCall('/admin/conversations');
        const conv = convs.find(c => c.customerId === customerId);
        if (!conv) return;
        const messages = conv.messages;
        const chatArea = document.getElementById('chatArea');
        chatArea.innerHTML = `
            <div class="chat-window">
                <div class="chat-messages" id="adminChatMessages">
                    ${messages.map(msg => `
                        <div class="message-bubble ${msg.senderType === 'admin' ? 'outgoing' : 'incoming'}" data-message-id="${msg.id}">
                            <div class="message-content">${escapeHtml(msg.content)}</div>
                            <div class="message-time">${new Date(msg.createdAt).toLocaleString()}</div>
                            <div class="message-actions" onclick="showAdminMessageOptions('${msg.id}', ${msg.senderType === 'admin'})">
                                <i class="fas fa-ellipsis-v"></i>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="chat-input-area">
                    <textarea id="adminMessageInput" placeholder="Type message to ${escapeHtml(conv.customerName)}..."></textarea>
                    <button onclick="sendAdminMessage('${customerId}')" class="send-btn"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        const chatDiv = document.getElementById('adminChatMessages');
        if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
        document.getElementById('adminMessageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendAdminMessage(customerId);
            }
        });
        messages.forEach(msg => {
            if (!msg.read && msg.senderType === 'customer') markAdminMessageRead(msg.id);
        });
    } catch (error) {
        console.error('Error selecting conversation:', error);
        showNotification('Failed to load conversation', 'error');
    }
}

async function sendAdminMessage(customerId) {
    const content = document.getElementById('adminMessageInput').value.trim();
    if (!content) return;
    try {
        await apiCall('/messages', {
            method: 'POST',
            body: JSON.stringify({
                senderId: 'admin', senderType: 'admin',
                recipientId: customerId, recipientType: 'customer',
                content
            })
        });
        document.getElementById('adminMessageInput').value = '';
        selectConversation(customerId);
        updateUnattendedBadges();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function markAdminMessageRead(messageId) {
    await fetch(`${API_BASE}/messages/${messageId}/read`, { method: 'PUT' });
}

function showAdminMessageOptions(messageId, isOwn) {
    const menu = document.createElement('div');
    menu.className = 'message-options-menu';
    menu.style.cssText = 'position:fixed;background:white;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.2);padding:0.5rem;z-index:10001;';
    menu.innerHTML = `<button onclick="deleteAdminMessageForMe('${messageId}');this.closest('.message-options-menu').remove();" style="display:block;width:100%;padding:0.5rem;background:none;border:none;text-align:left;cursor:pointer;"><i class="fas fa-trash-alt"></i> Delete for me</button>`;
    document.body.appendChild(menu);
    const icon = event.target;
    const rect = icon.getBoundingClientRect();
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.left = rect.left - 100 + 'px';
    setTimeout(() => document.addEventListener('click', function rm(e) { if (!menu.contains(e.target) && e.target !== icon) { menu.remove(); document.removeEventListener('click', rm); } }), 0);
}

async function deleteAdminMessageForMe(messageId) {
    showConfirmDialog('Delete this message?', async (confirmed) => {
        if (!confirmed) return;
        try {
            await fetch(`${API_BASE}/messages/${messageId}/for-me`, { method: 'DELETE', body: JSON.stringify({ userId: 'admin' }), headers: { 'Content-Type': 'application/json' } });
            selectConversation(currentChatCustomerId);
            updateUnattendedBadges();
        } catch (error) {
            showNotification('Failed to delete message', 'error');
        }
    });
}

// Reports
function loadReports() {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate()-30);
    document.getElementById('reportStartDate').value = thirtyDaysAgo.toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('reportSummary').innerHTML = '';
    document.getElementById('reportOrdersTable').innerHTML = '<p>Click "Generate Report" to view data</p>';
    document.getElementById('downloadReportBtn').style.display = 'none';
}

async function generateReport() {
    const start = document.getElementById('reportStartDate').value;
    const end = document.getElementById('reportEndDate').value;
    if (!start || !end) return showNotification('Select dates', 'error');
    try {
        const orders = await apiCall('/admin/orders');
        const filtered = orders.filter(o => {
            const d = new Date(o.createdAt);
            return d >= new Date(start) && d <= new Date(end+'T23:59:59');
        });
        const totalOrders = filtered.length;
        const completed = filtered.filter(o => o.status === 'completed').length;
        const revenue = filtered.filter(o => o.paymentStatus === 'completed').reduce((s,o) => s + (o.finalCost||0),0);
        document.getElementById('reportSummary').innerHTML = `
            <div class="stat-card"><h3>${totalOrders}</h3><p>Total Orders</p></div>
            <div class="stat-card"><h3>${completed}</h3><p>Completed</p></div>
            <div class="stat-card"><h3>Ksh ${revenue}</h3><p>Revenue</p></div>
        `;
        if (filtered.length) {
            document.getElementById('reportOrdersTable').innerHTML = `
                <table>
                    <thead>
                        <tr><th>Order ID</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th></tr>
                    </thead>
                    <tbody>
                        ${filtered.map(o => `
                            <tr>
                                <td>#${o.id.slice(-8)}</td>
                                <td>${escapeHtml(o.customerName)}</td>
                                <td>${escapeHtml(o.customerPhone)}</td>
                                <td>Ksh ${o.finalCost||0}</td>
                                <td><span class="order-status status-${o.status.replace(/_/g, '-')}">${o.status}</span></td>
                                <td>${new Date(o.createdAt).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            document.getElementById('downloadReportBtn').style.display = 'inline-block';
            currentReportOrders = filtered;
        } else {
            document.getElementById('reportOrdersTable').innerHTML = '<p>No orders found for selected period</p>';
            document.getElementById('downloadReportBtn').style.display = 'none';
        }
    } catch (error) {
        console.error('Error generating report:', error);
        showNotification('Failed to generate report', 'error');
    }
}

function downloadReportExcel() {
    if (!currentReportOrders || currentReportOrders.length === 0) return showNotification('Generate report first', 'error');
    const wsData = [['Order ID', 'Customer', 'Phone', 'Amount', 'Status', 'Date']];
    currentReportOrders.forEach(o => {
        wsData.push([o.id.slice(-8), o.customerName, o.customerPhone, o.finalCost||0, o.status, new Date(o.createdAt).toLocaleString()]);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function logout() { 
    localStorage.removeItem('currentAgent'); 
    location.reload(); 
}

function escapeHtml(str) { 
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m])); 
}

function closeModal(id) { 
    const el = document.getElementById(id); 
    if (el) el.remove(); 
}

// Make global
window.downloadFile = downloadFile;
window.showConfirmPageModal = showConfirmPageModal;
window.confirmPageCountAndCost = confirmPageCountAndCost;
window.updateOrderStatus = updateOrderStatus;
window.cancelOrder = cancelOrder;
window.updatePricing = updatePricing;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
window.selectConversation = selectConversation;
window.sendAdminMessage = sendAdminMessage;
window.showBroadcastModal = showBroadcastModal;
window.closeBroadcastModal = closeBroadcastModal;
window.sendBroadcast = sendBroadcast;
window.showAdminMessageOptions = showAdminMessageOptions;
window.deleteAdminMessageForMe = deleteAdminMessageForMe;
window.logout = logout;
window.refreshDashboard = () => { loadDashboard(); showNotification('Dashboard refreshed', 'success'); updateUnattendedBadges(); };
window.refreshReviewOrders = () => { loadPendingReviewOrders(); showNotification('Review orders refreshed', 'success'); updateUnattendedBadges(); };
window.refreshActiveOrders = () => { loadActiveOrders(); showNotification('Active orders refreshed', 'success'); };
window.refreshUsers = () => { loadUsers(); showNotification('Users refreshed', 'success'); };
window.refreshPricing = () => { loadPricing(); showNotification('Pricing refreshed', 'success'); };
window.refreshCustomerMessages = () => { loadCustomerMessages(); showNotification('Messages refreshed', 'success'); updateUnattendedBadges(); };
window.generateReport = generateReport;
window.downloadReportExcel = downloadReportExcel;
window.closeModal = closeModal;
window.showConfirmDialog = showConfirmDialog;
window.changeProfitPeriod = changeProfitPeriod;
window.printProfitChart = printProfitChart;