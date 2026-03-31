// script.js – Customer platform with production-ready code
// Updated with proper error handling and socket reconnection

let currentUser = null;
let uploadedFiles = [];
let notificationContainer = null;
let currentFilter = 'all';
let selectedMessages = new Set();
let messageSelectionMode = false;
let pendingOrderIdForPayment = null;
let pendingOrderAmount = 0;
let currentActionMessageId = null;
let socketReconnectAttempts = 0;

document.addEventListener('DOMContentLoaded', () => {
    createNotificationContainer();
    checkLoginStatus();
    setupEventListeners();
    if (currentUser) {
        loadUserNotifications();
        updateMessageBadge();
        updateNotificationBadge();
    }
    startAutoUpdate();
    
    // Socket event listeners
    if (socket) {
        socket.on('connect', () => {
            console.log('Connected to server');
            if (currentUser) {
                updateMessageBadge();
                updateNotificationBadge();
            }
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            showNotification('Connection lost. Reconnecting...', 'error');
        });
        
        socket.on('orderUpdate', (order) => {
            console.log('Order update received:', order);
            if (currentUser && order.customerId === currentUser.id) {
                if (document.getElementById('ordersSection')?.style.display === 'block') loadUserOrders();
                
                let friendlyMessage = '';
                switch(order.status) {
                    case 'paid': friendlyMessage = 'Your payment has been confirmed. We will start processing your order soon.'; break;
                    case 'printing': friendlyMessage = 'Your work is now being printed.'; break;
                    case 'ready': friendlyMessage = 'Your order is ready for pickup.'; break;
                    case 'completed': friendlyMessage = 'Your order has been completed. Thank you for choosing Amste Print Media!'; break;
                    case 'cancelled': friendlyMessage = 'Your order has been cancelled. Please contact support for more information.'; break;
                    default: friendlyMessage = `Order #${order.id.slice(-8)} status: ${order.status}`;
                }
                showNotification(friendlyMessage, 'info');
                addNotificationToPanel(friendlyMessage, 'order');
                updateNotificationBadge();
            }
        });
        
        socket.on('newMessage', (msg) => {
            console.log('New message received:', msg);
            if (currentUser && (msg.senderId === currentUser.id || msg.recipientId === currentUser.id)) {
                if (document.getElementById('messagesSection')?.style.display === 'block') {
                    if (document.getElementById('chatMessages')) {
                        appendNewMessage(msg);
                    } else {
                        loadMessages();
                    }
                } else {
                    updateMessageBadge();
                }
                if (msg.senderType === 'admin' && msg.recipientId === currentUser.id) {
                    showNotification(`New message from Support: ${msg.content.substring(0, 50)}${msg.content.length > 50 ? '...' : ''}`, 'info');
                    addNotificationToPanel(`New message from Support: ${msg.content.substring(0, 100)}`, 'message');
                    updateNotificationBadge();
                }
            }
        });
        
        socket.on('messageDeleted', (data) => {
            if (document.getElementById('messagesSection')?.style.display === 'block') {
                const msgElement = document.querySelector(`.message-bubble[data-message-id="${data.messageId}"]`);
                if (msgElement) msgElement.remove();
                loadMessages();
            }
        });
        
        socket.on('notification', (notification) => {
            if (currentUser && notification.userId === currentUser.id) {
                addNotificationToPanel(notification.message, notification.type);
                showNotification(notification.message, notification.type);
                updateNotificationBadge();
                if (document.getElementById('notificationsSection')?.style.display === 'block') {
                    loadNotificationsList();
                }
            }
        });
    }
});

function startAutoUpdate() {
    setInterval(() => {
        if (currentUser && document.getElementById('ordersSection')?.style.display === 'block') {
            loadUserOrders();
        }
        if (currentUser) {
            updateNotificationBadge();
            updateMessageBadge();
        }
    }, 10000); // Increased to 10 seconds to reduce server load
}

function createNotificationContainer() {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.cssText = 'position: fixed; top: 80px; right: 20px; z-index: 9999; max-width: 350px; width: 100%;';
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

function addNotificationToPanel(message, type) {
    try {
        const notifications = JSON.parse(localStorage.getItem('userNotifications') || '[]');
        notifications.unshift({
            id: Date.now(),
            message: message,
            type: type,
            read: false,
            createdAt: new Date().toISOString()
        });
        while (notifications.length > 50) notifications.pop();
        localStorage.setItem('userNotifications', JSON.stringify(notifications));
    } catch (error) {
        console.error('Error saving notification:', error);
    }
}

async function loadNotificationsList() {
    try {
        const notifications = JSON.parse(localStorage.getItem('userNotifications') || '[]');
        const container = document.getElementById('notificationsList');
        if (!container) return;
        
        if (notifications.length === 0) {
            container.innerHTML = '<div class="notification-item">No notifications yet.</div>';
            return;
        }
        
        container.innerHTML = notifications.map(n => `
            <div class="notification-item ${!n.read ? 'unread' : ''}" data-id="${n.id}" onclick="markNotificationReadFromList('${n.id}')">
                <div class="notification-message">${escapeHtml(n.message)}</div>
                <div class="notification-time">${new Date(n.createdAt).toLocaleString()}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

async function markNotificationReadFromList(notificationId) {
    try {
        const notifications = JSON.parse(localStorage.getItem('userNotifications') || '[]');
        const notification = notifications.find(n => n.id == notificationId);
        if (notification) {
            notification.read = true;
            localStorage.setItem('userNotifications', JSON.stringify(notifications));
            loadNotificationsList();
            updateNotificationBadge();
        }
    } catch (error) {
        console.error('Error marking notification read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        const notifications = JSON.parse(localStorage.getItem('userNotifications') || '[]');
        notifications.forEach(n => n.read = true);
        localStorage.setItem('userNotifications', JSON.stringify(notifications));
        loadNotificationsList();
        updateNotificationBadge();
        showNotification('All notifications marked as read', 'success');
    } catch (error) {
        console.error('Error marking all notifications read:', error);
    }
}

async function updateNotificationBadge() {
    try {
        const notifications = JSON.parse(localStorage.getItem('userNotifications') || '[]');
        const unreadCount = notifications.filter(n => !n.read).length;
        const navBadge = document.getElementById('navNotificationBadge');
        if (unreadCount > 0) {
            navBadge.textContent = unreadCount;
            navBadge.style.display = 'inline-block';
        } else {
            navBadge.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating notification badge:', error);
    }
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

function showMessageActionMenu(messageId, event) {
    event.stopPropagation();
    currentActionMessageId = messageId;
    const menu = document.getElementById('messageActionMenu');
    const rect = event.target.getBoundingClientRect();
    menu.style.display = 'block';
    menu.style.position = 'fixed';
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.left = rect.left + 'px';
    
    const closeMenu = (e) => {
        if (!menu.contains(e.target) && e.target !== event.target) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function deleteSelectedMessage() {
    if (!currentActionMessageId) return;
    showConfirmDialog('Delete this message?', async (confirmed) => {
        if (!confirmed) return;
        try {
            await fetch(`${API_BASE}/messages/${currentActionMessageId}/for-me`, { 
                method: 'DELETE', 
                body: JSON.stringify({ userId: currentUser.id }), 
                headers: { 'Content-Type': 'application/json' } 
            });
            showNotification('Message deleted', 'success');
            document.getElementById('messageActionMenu').style.display = 'none';
            loadMessages();
            currentActionMessageId = null;
        } catch (error) {
            showNotification('Failed to delete message', 'error');
        }
    });
}

function resetOrderForm() {
    uploadedFiles = [];
    displayUploadedFiles();
    document.getElementById('printSettings').style.display = 'none';
    document.getElementById('copies').value = '1';
    document.getElementById('paperSize').value = 'A4';
    document.getElementById('printType').value = 'bw';
    document.getElementById('layout').value = 'single';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
    const uploadedFilesContainer = document.getElementById('uploadedFiles');
    if (uploadedFilesContainer) uploadedFilesContainer.innerHTML = '';
    const imageInfo = document.getElementById('imageInfo');
    if (imageInfo) imageInfo.innerHTML = '';
    if (imageInfo) imageInfo.style.display = 'none';
    document.getElementById('docSettings').style.display = 'block';
    document.getElementById('printType').disabled = false;
    document.getElementById('paperSize').disabled = false;
    document.getElementById('layout').disabled = false;
}

// ---------- Auth ----------
async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    try {
        const data = await apiCall('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        currentUser = data.user;
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUIForLoggedInUser();
        closeModal('loginModal');
        showNotification('Login successful! Welcome back!', 'success');
        loadUserNotifications();
        updateMessageBadge();
        updateNotificationBadge();
        resetOrderForm();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const firstName = document.getElementById('regFirstName').value.trim();
    const lastName = document.getElementById('regLastName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirmPassword').value;
    const address = document.getElementById('regAddress').value.trim();
    
    const phoneRegex = /^[0-9]{10,12}$/;
    if (!phoneRegex.test(phone)) {
        showNotification('Please enter a valid phone number (10-12 digits, numbers only)', 'error');
        return;
    }
    
    if (password !== confirm) {
        showNotification('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        const data = await apiCall('/register', { method: 'POST', body: JSON.stringify({ firstName, lastName, email, phone, password, address }) });
        closeModal('registerModal');
        showNotification('Account created successfully! Please login to continue.', 'success');
        document.getElementById('registerForm').reset();
        showLoginModal();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

function checkLoginStatus() {
    const stored = localStorage.getItem('currentUser');
    if (stored) {
        try {
            currentUser = JSON.parse(stored);
            updateUIForLoggedInUser();
            loadUserNotifications();
            updateMessageBadge();
            updateNotificationBadge();
            resetOrderForm();
        } catch (error) {
            console.error('Error parsing stored user:', error);
            localStorage.removeItem('currentUser');
        }
    }
}

function updateUIForLoggedInUser() {
    document.getElementById('authButtons').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('userName').innerText = `${currentUser.firstName} ${currentUser.lastName}`;
}

function logout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    document.getElementById('authButtons').style.display = 'flex';
    document.getElementById('userMenu').style.display = 'none';
    showNotification('Logged out successfully', 'success');
    showHome();
    resetOrderForm();
}

// ---------- File Upload & Order ----------
function setupEventListeners() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = '#667eea'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = '#e0e0e0'; });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#e0e0e0';
            handleFiles(e.dataTransfer.files);
        });
    }
    if (fileInput) fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            filterOrders(currentFilter);
        });
    });
    
    document.getElementById('copies')?.addEventListener('input', () => {
        updateImagePriceEstimate();
    });
}

function handleFiles(files) {
    uploadedFiles = Array.from(files);
    displayUploadedFiles();
    if (uploadedFiles.length > 0) {
        document.getElementById('printSettings').style.display = 'block';
        updatePrintSettingsVisibility();
    }
}

function displayUploadedFiles() {
    const container = document.getElementById('uploadedFiles');
    if (!container) return;
    if (uploadedFiles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = '<h3>Uploaded Files:</h3>' + uploadedFiles.map((file, idx) => `
        <div class="file-item">
            <i class="fas fa-file"></i>
            <span>${escapeHtml(file.name)} (${(file.size/1024/1024).toFixed(2)} MB)</span>
            <button class="btn-remove" onclick="removeFile(${idx})">Remove</button>
        </div>
    `).join('');
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    displayUploadedFiles();
    if (uploadedFiles.length === 0) document.getElementById('printSettings').style.display = 'none';
    else updatePrintSettingsVisibility();
}

function updatePrintSettingsVisibility() {
    const allImages = uploadedFiles.length > 0 && uploadedFiles.every(f => f.type.startsWith('image/'));
    document.getElementById('docSettings').style.display = allImages ? 'none' : 'block';
    document.getElementById('imageInfo').style.display = allImages ? 'block' : 'none';
    document.getElementById('printType').disabled = allImages;
    document.getElementById('paperSize').disabled = allImages;
    document.getElementById('layout').disabled = allImages;
    if (allImages) updateImagePriceEstimate();
}

function updateImagePriceEstimate() {
    if (!uploadedFiles.length) return;
    const allImages = uploadedFiles.every(f => f.type.startsWith('image/'));
    if (!allImages) return;
    const copies = parseInt(document.getElementById('copies').value) || 1;
    
    fetch(`${API_BASE}/pricing`).then(res => res.json()).then(pricing => {
        let cost = uploadedFiles.length * pricing.imagePrint * copies;
        document.getElementById('imageInfo').innerHTML = `<div style="background:#e8f0fe;padding:1rem;border-radius:12px;"><strong>Amount to Pay: Ksh ${cost}</strong></div>`;
    }).catch(err => console.error('Error fetching pricing:', err));
}

async function createOrder() {
    if (!currentUser) return showNotification('Please login first', 'error');
    if (uploadedFiles.length === 0) return showNotification('Upload files first', 'error');
    
    const formData = new FormData();
    for (let file of uploadedFiles) formData.append('files', file);
    
    const copies = parseInt(document.getElementById('copies').value) || 1;
    
    const settings = {
        paperSize: document.getElementById('paperSize').value,
        printType: document.getElementById('printType').value,
        layout: document.getElementById('layout').value,
        copies: copies
    };
    const orderData = {
        customerId: currentUser.id,
        customerName: `${currentUser.firstName} ${currentUser.lastName}`,
        customerEmail: currentUser.email,
        customerPhone: currentUser.phone,
        settings
    };
    formData.append('orderData', JSON.stringify(orderData));
    
    const submitBtn = document.querySelector('.btn-submit-order');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    try {
        const res = await fetch(`${API_BASE}/orders`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            let successMsg = 'Order submitted successfully! ';
            if (data.allImages) {
                successMsg += `Please pay Ksh ${data.finalCost} to complete your order.`;
            } else {
                successMsg += 'Our team will review your documents and confirm the final cost.';
            }
            showNotification(successMsg, 'success');
            resetOrderForm();
            showOrders();
        } else {
            showNotification(data.error || 'Order failed', 'error');
        }
    } catch (err) {
        showNotification(err.message, 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// ---------- Orders ----------
async function loadUserOrders() {
    if (!currentUser) return;
    try {
        const orders = await apiCall(`/users/${currentUser.id}/orders`);
        const filtered = currentFilter === 'all' ? orders : orders.filter(o => o.status === currentFilter);
        displayOrders(filtered);
    } catch (error) {
        console.error('Error loading orders:', error);
        showNotification('Error loading orders', 'error');
    }
}

function displayOrders(orders) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    if (orders.length === 0) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;"><i class="fas fa-box-open fa-3x"></i><p>No orders found.</p><button class="btn-primary" onclick="scrollToUpload()">Start Printing</button></div>`;
        return;
    }
    container.innerHTML = orders.map(order => {
        const amountToPay = order.amountToPay || order.finalCost || 0;
        const isAwaitingPayment = order.status === 'awaiting_payment' && order.adminConfirmedPages;
        const isCompleted = order.status === 'completed';
        
        return `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">Order #${order.id.slice(-8)}</span>
                <span class="order-status status-${order.status.replace(/_/g, '-')}">${order.status.replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <div class="order-details">
                <div><i class="fas fa-calendar"></i> Date: ${new Date(order.createdAt).toLocaleString()}</div>
                <div><i class="fas fa-file"></i> Files: ${order.files.length} file(s)</div>
                <div><i class="fas fa-print"></i> Print Type: ${order.settings.printType === 'bw' ? 'Black & White' : 'Color'}</div>
                <div><i class="fas fa-copy"></i> Copies: ${order.settings.copies}</div>
                ${order.settings.finalPageCount ? `<div><i class="fas fa-file-alt"></i> Pages: ${order.settings.finalPageCount}</div>` : ''}
                ${amountToPay > 0 ? `<div><strong style="color: #28a745; font-size: 1.1rem;">Amount to Pay: Ksh ${amountToPay}</strong></div>` : ''}
            </div>
            <div class="order-tracking">
                ${getTrackingSteps(order)}
            </div>
            ${isAwaitingPayment && amountToPay > 0 ? `<button class="btn-primary" onclick="showPaymentModal('${order.id}', ${amountToPay})" style="background: #28a745; margin-top: 1rem;">Pay Now - Ksh ${amountToPay}</button>` : ''}
            ${isCompleted ? `<button class="btn-primary" onclick="viewReceipt('${order.id}')">View Receipt</button>` : ''}
        </div>
    `}).join('');
}

function getTrackingSteps(order) {
    const steps = [
        { name: 'Order Submitted', key: 'orderReceived', icon: 'fa-cloud-upload-alt' },
        { name: 'Admin Review', key: 'adminConfirmed', icon: 'fa-clipboard-list' },
        { name: 'Payment', key: 'paymentCompleted', icon: 'fa-credit-card' },
        { name: 'Printing', key: 'printing', icon: 'fa-print' },
        { name: 'Ready', key: 'ready', icon: 'fa-check' },
        { name: 'Completed', key: 'completed', icon: 'fa-flag-checkered' }
    ];
    
    const statusMap = { 'pending_admin_review':0, 'awaiting_payment':1, 'paid':2, 'printing':3, 'ready':4, 'completed':5, 'cancelled':-1 };
    let currentStep = statusMap[order.status] || 0;
    const paymentCompleted = order.paymentStatus === 'completed';
    
    return steps.map((step, idx) => {
        let completed = false;
        if (step.key === 'adminConfirmed') completed = order.adminConfirmedPages;
        else if (step.key === 'paymentCompleted') completed = paymentCompleted;
        else completed = order.tracking[step.key];
        
        const active = !completed && idx === currentStep && order.status !== 'cancelled';
        return `<div class="tracking-step ${completed ? 'completed' : ''} ${active ? 'active' : ''}">
            <i class="fas ${step.icon}"></i>
            <div>${step.name}</div>
            ${completed ? '<small>✓</small>' : ''}
        </div>`;
    }).join('');
}

function showPaymentModal(orderId, amount) {
    pendingOrderIdForPayment = orderId;
    pendingOrderAmount = amount;
    const paymentAmountElement = document.getElementById('paymentAmount');
    if (paymentAmountElement) {
        paymentAmountElement.innerText = `Ksh ${amount}`;
    }
    document.getElementById('paymentModal').style.display = 'flex';
}

async function submitPayment() {
    const mpesaNumber = document.getElementById('mpesaNumber').value.trim();
    if (!mpesaNumber) {
        showNotification('Enter M-Pesa number', 'error');
        return;
    }
    const phoneRegex = /^[0-9]{10,12}$/;
    if (!phoneRegex.test(mpesaNumber)) {
        showNotification('Please enter a valid phone number (10-12 digits, numbers only)', 'error');
        return;
    }
    
    if (!pendingOrderIdForPayment) {
        showNotification('No order selected for payment', 'error');
        return;
    }
    
    if (!pendingOrderAmount || pendingOrderAmount <= 0) {
        showNotification('Invalid payment amount. Please contact support.', 'error');
        return;
    }
    
    try {
        const data = await apiCall(`/orders/${pendingOrderIdForPayment}/pay`, { 
            method: 'POST', 
            body: JSON.stringify({ mpesaNumber }) 
        });
        showNotification(`Payment of Ksh ${pendingOrderAmount} successful!`, 'success');
        closeModal('paymentModal');
        document.getElementById('mpesaNumber').value = '';
        pendingOrderIdForPayment = null;
        pendingOrderAmount = 0;
        loadUserOrders();
        updateMessageBadge();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

function viewReceipt(orderId) {
    fetch(`${API_BASE}/admin/orders`).then(res => res.json()).then(orders => {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        const amountPaid = order.paidAmount || order.amountToPay || order.finalCost || 0;
        const filesDetails = order.files.map(f => `<li>${escapeHtml(f.name)} (${f.fileType === 'image' ? 'Image' : 'Document'})</li>`).join('');
        const modalHtml = `
            <div id="receiptModal" class="receipt-modal">
                <div class="receipt-content">
                    <div class="receipt-header">
                        <h3>Payment Receipt</h3>
                        <span class="receipt-close" onclick="closeReceiptModal()">&times;</span>
                    </div>
                    <div class="receipt-body">
                        <h4>Amste Print Media</h4>
                        <p><strong>Order Number:</strong> ${order.id.slice(-8)}</p>
                        <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleString()}</p>
                        <p><strong>Customer:</strong> ${escapeHtml(order.customerName)}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}</p>
                        <hr>
                        <p><strong>Documents:</strong></p>
                        <ul>${filesDetails}</ul>
                        <p><strong>Item Ordered:</strong> ${order.settings.printType === 'bw' ? 'Black & White Printing' : 'Color Printing'}, Copies: ${order.settings.copies}</p>
                        ${order.settings.finalPageCount ? `<p><strong>Pages:</strong> ${order.settings.finalPageCount}</p>` : ''}
                        <hr>
                        <p><strong style="font-size: 1.2rem;">Amount Paid:</strong> <strong style="font-size: 1.2rem; color: #28a745;">Ksh ${amountPaid}</strong></p>
                        <p><strong>Payment Method:</strong> M-Pesa</p>
                        <p><strong>M-Pesa Number:</strong> ${order.mpesaNumber}</p>
                        <p><strong>Payment Date:</strong> ${order.paymentDate ? new Date(order.paymentDate).toLocaleString() : 'N/A'}</p>
                        <p><strong>Status:</strong> ${order.status}</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }).catch(err => console.error('Error fetching order for receipt:', err));
}

function closeReceiptModal() {
    const modal = document.getElementById('receiptModal');
    if (modal) modal.remove();
}

function filterOrders(filter) { currentFilter = filter; loadUserOrders(); }
function scrollToUpload() { document.getElementById('uploadSection').scrollIntoView({ behavior: 'smooth' }); showHome(); }

// ---------- Messages ----------
let currentMessagesList = [];

async function loadMessages() {
    if (!currentUser) return;
    try {
        const messages = await apiCall(`/users/${currentUser.id}/messages`);
        currentMessagesList = messages;
        renderMessages(messages);
    } catch (err) {
        console.error('Error loading messages:', err);
        showNotification('Error loading messages', 'error');
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    const conversationPartner = messages.length > 0 ? (messages[0].senderType === 'admin' ? 'Support Team' : 'Customer Support') : 'Support';
    if (messages.length === 0) {
        container.innerHTML = `<div class="chat-window empty"><div class="empty-chat"><i class="fas fa-comments"></i><p>No messages yet. Start a conversation with ${conversationPartner}!</p></div><div class="chat-input-area"><textarea id="messageInput" placeholder="Type your message... (press Enter)"></textarea><button onclick="sendMessageToAdmin()" class="send-btn"><i class="fas fa-paper-plane"></i></button></div></div>`;
        setupChatInputListener();
        return;
    }
    const html = `<div class="chat-window"><div class="chat-messages" id="chatMessages">${messages.map(msg => `
        <div class="message-bubble ${msg.senderType === 'customer' ? 'outgoing' : 'incoming'}" data-message-id="${msg.id}">
            ${messageSelectionMode ? `<input type="checkbox" onchange="toggleMessageSelection('${msg.id}')" style="margin-right: 0.5rem;">` : ''}
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${new Date(msg.createdAt).toLocaleString()}</div>
            ${msg.senderType === 'customer' ? `<div class="message-actions" onclick="showMessageActionMenu('${msg.id}', event)">
                <i class="fas fa-ellipsis-v"></i>
            </div>` : ''}
        </div>
    `).join('')}</div><div class="chat-input-area"><textarea id="messageInput" placeholder="Type your message... (press Enter)"></textarea><button onclick="sendMessageToAdmin()" class="send-btn"><i class="fas fa-paper-plane"></i></button></div></div>`;
    container.innerHTML = html;
    const chatDiv = document.getElementById('chatMessages');
    if (chatDiv) chatDiv.scrollTop = chatDiv.scrollHeight;
    setupChatInputListener();
    messages.forEach(msg => {
        if (!msg.read && msg.senderType === 'admin') markMessageRead(msg.id);
    });
    updateMessageBadge();
}

function appendNewMessage(msg) {
    if (document.querySelector(`.message-bubble[data-message-id="${msg.id}"]`)) return;
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-bubble ${msg.senderType === 'customer' ? 'outgoing' : 'incoming'}`;
    messageDiv.setAttribute('data-message-id', msg.id);
    messageDiv.innerHTML = `
        ${messageSelectionMode ? `<input type="checkbox" onchange="toggleMessageSelection('${msg.id}')" style="margin-right: 0.5rem;">` : ''}
        <div class="message-content">${escapeHtml(msg.content)}</div>
        <div class="message-time">${new Date(msg.createdAt).toLocaleString()}</div>
        ${msg.senderType === 'customer' ? `<div class="message-actions" onclick="showMessageActionMenu('${msg.id}', event)">
            <i class="fas fa-ellipsis-v"></i>
        </div>` : ''}
    `;
    container.appendChild(messageDiv);
    container.scrollTop = container.scrollHeight;
    if (!msg.read && msg.senderType === 'admin') markMessageRead(msg.id);
    updateMessageBadge();
}

async function markMessageRead(messageId) {
    try {
        await fetch(`${API_BASE}/messages/${messageId}/read`, { method: 'PUT' });
    } catch (error) {
        console.error('Error marking message read:', error);
    }
}

async function sendMessageToAdmin() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content) return;
    try {
        await apiCall('/messages', {
            method: 'POST',
            body: JSON.stringify({
                senderId: currentUser.id, senderType: 'customer',
                recipientId: 'admin', recipientType: 'admin',
                content
            })
        });
        input.value = '';
        loadMessages();
        updateMessageBadge();
    } catch (err) {
        showNotification(err.message, 'error');
    }
}

function setupChatInputListener() {
    const input = document.getElementById('messageInput');
    if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessageToAdmin(); } });
}

function toggleMessageSelectionMode() {
    messageSelectionMode = !messageSelectionMode;
    selectedMessages.clear();
    document.getElementById('selectMessagesBtn').innerHTML = messageSelectionMode ? '<i class="fas fa-times"></i> Cancel' : '<i class="fas fa-check-double"></i> Select';
    document.getElementById('deleteSelectedBtn').style.display = messageSelectionMode ? 'inline-block' : 'none';
    loadMessages();
}

function toggleMessageSelection(id) {
    if (selectedMessages.has(id)) selectedMessages.delete(id);
    else selectedMessages.add(id);
}

async function deleteSelectedMessages() {
    if (selectedMessages.size === 0) return showNotification('No messages selected', 'error');
    showConfirmDialog(`Delete ${selectedMessages.size} message(s)?`, async (confirmed) => {
        if (!confirmed) return;
        for (let id of selectedMessages) {
            try {
                await fetch(`${API_BASE}/messages/${id}/for-me`, { method: 'DELETE', body: JSON.stringify({ userId: currentUser.id }), headers: { 'Content-Type': 'application/json' } });
            } catch (error) {
                console.error('Error deleting message:', error);
            }
        }
        showNotification('Messages deleted', 'success');
        selectedMessages.clear();
        messageSelectionMode = false;
        loadMessages();
    });
}

function updateMessageBadge() {
    if (!currentUser) return;
    fetch(`${API_BASE}/users/${currentUser.id}/messages`).then(res => res.json()).then(msgs => {
        const unread = msgs.filter(m => !m.read && m.senderType === 'admin').length;
        const badge = document.getElementById('messageBadge');
        if (badge) {
            if (unread > 0) {
                badge.textContent = unread;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }).catch(err => console.error('Error updating message badge:', err));
}

// ---------- Profile ----------
function showProfile() {
    document.getElementById('uploadSection').style.display = 'none';
    document.getElementById('ordersSection').style.display = 'none';
    document.getElementById('messagesSection').style.display = 'none';
    document.getElementById('notificationsSection').style.display = 'none';
    document.getElementById('profileSection').style.display = 'block';
    loadProfileData();
}

function loadProfileData() {
    const container = document.getElementById('profileForm');
    if (!container || !currentUser) return;
    container.innerHTML = `
        <div class="profile-info">
            <div class="profile-avatar">
                <i class="fas fa-user-circle fa-4x"></i>
            </div>
            <div class="profile-details">
                <p><strong>Name:</strong> ${escapeHtml(currentUser.firstName)} ${escapeHtml(currentUser.lastName)}</p>
                <p><strong>Email:</strong> ${escapeHtml(currentUser.email)}</p>
                <p><strong>Phone:</strong> ${escapeHtml(currentUser.phone)}</p>
                <p><strong>Address:</strong> ${escapeHtml(currentUser.address)}</p>
            </div>
            <button class="btn-primary" onclick="editProfile()">Edit Profile</button>
        </div>
    `;
}

function editProfile() { showNotification('Profile editing coming soon', 'info'); }
function loadUserNotifications() { updateNotificationBadge(); }

// Navigation
function showHome() {
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('ordersSection').style.display = 'none';
    document.getElementById('profileSection').style.display = 'none';
    document.getElementById('messagesSection').style.display = 'none';
    document.getElementById('notificationsSection').style.display = 'none';
}

function showOrders() { if (!currentUser) return showLoginModal(); showHome(); document.getElementById('ordersSection').style.display = 'block'; document.getElementById('uploadSection').style.display = 'none'; loadUserOrders(); }

function showMessages() { if (!currentUser) return showLoginModal(); showHome(); document.getElementById('messagesSection').style.display = 'block'; document.getElementById('uploadSection').style.display = 'none'; loadMessages(); }

function showNotifications() { if (!currentUser) return showLoginModal(); showHome(); document.getElementById('notificationsSection').style.display = 'block'; document.getElementById('uploadSection').style.display = 'none'; loadNotificationsList(); }

function showLoginModal() { document.getElementById('loginModal').style.display = 'flex'; }
function showRegisterModal() { document.getElementById('registerModal').style.display = 'flex'; }
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; else document.querySelector('.modal')?.remove(); }

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
}

// Make global
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.showHome = showHome;
window.showOrders = showOrders;
window.showMessages = showMessages;
window.showNotifications = showNotifications;
window.showProfile = showProfile;
window.showLoginModal = showLoginModal;
window.showRegisterModal = showRegisterModal;
window.closeModal = closeModal;
window.closeReceiptModal = closeReceiptModal;
window.scrollToUpload = scrollToUpload;
window.removeFile = removeFile;
window.createOrder = createOrder;
window.showPaymentModal = showPaymentModal;
window.submitPayment = submitPayment;
window.viewReceipt = viewReceipt;
window.toggleMessageSelectionMode = toggleMessageSelectionMode;
window.toggleMessageSelection = toggleMessageSelection;
window.deleteSelectedMessages = deleteSelectedMessages;
window.showMessageActionMenu = showMessageActionMenu;
window.deleteSelectedMessage = deleteSelectedMessage;
window.sendMessageToAdmin = sendMessageToAdmin;
window.markAllNotificationsRead = markAllNotificationsRead;
window.markNotificationReadFromList = markNotificationReadFromList;
window.showConfirmDialog = showConfirmDialog;
window.resetOrderForm = resetOrderForm;