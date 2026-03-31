// backend.js - Complete Backend with Vouchers, Inactivity Reminders, and Enhanced Messaging
// Added socket support for real‑time updates

class PrintingBackend {
    constructor() {
        this.users = [];
        this.orders = [];
        this.payments = [];
        this.notifications = [];
        this.messages = [];
        this.vouchers = [];
        this.inventory = {
            paperA4: 5000,
            paperA3: 2000,
            blackInk: 80,
            colorInk: 60,
            bindingSpiral: 500,
            laminatingSheets: 1000
        };
        this.pricing = {
            blackWhite: 5,
            color: 10,
            imagePrint: 25,
            binding: 50,
            laminating: 30
        };
        this.currentUser = null;
        this.currentAgent = null;
        this.listeners = [];
        this.eventCallbacks = {
            orderUpdate: [],
            notification: [],
            newMessage: []
        };
        this.socket = null; // will be set from window
        
        this.loadAllData();
        this.initSampleData();
    }
    
    setSocket(socket) {
        this.socket = socket;
    }
    
    loadAllData() {
        const data = localStorage.getItem('printing_platform_data');
        if (data) {
            const parsed = JSON.parse(data);
            this.users = parsed.users || [];
            this.orders = parsed.orders || [];
            this.payments = parsed.payments || [];
            this.notifications = parsed.notifications || [];
            this.messages = parsed.messages || [];
            this.vouchers = parsed.vouchers || [];
            this.inventory = parsed.inventory || this.inventory;
            this.pricing = parsed.pricing || this.pricing;
        }
    }
    
    saveAllData() {
        const data = {
            users: this.users,
            orders: this.orders,
            payments: this.payments,
            notifications: this.notifications,
            messages: this.messages,
            vouchers: this.vouchers,
            inventory: this.inventory,
            pricing: this.pricing
        };
        localStorage.setItem('printing_platform_data', JSON.stringify(data));
        this.notifyListeners();
        this.emit('orderUpdate', this.getAllOrders());
    }
    
    addListener(callback) {
        this.listeners.push(callback);
    }
    
    notifyListeners() {
        this.listeners.forEach(callback => callback());
    }
    
    on(event, callback) {
        if (!this.eventCallbacks[event]) this.eventCallbacks[event] = [];
        this.eventCallbacks[event].push(callback);
    }
    
    emit(event, data) {
        if (this.eventCallbacks[event]) {
            this.eventCallbacks[event].forEach(callback => callback(data));
        }
    }
    
    generateId() {
        return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    hashPassword(password) {
        return btoa(password);
    }
    
    verifyPassword(password, hash) {
        return btoa(password) === hash;
    }
    
    detectFileType(fileName, fileType) {
        const extension = fileName.split('.').pop().toLowerCase();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'];
        if (imageExtensions.includes(extension) || fileType.includes('image')) {
            return 'image';
        }
        return 'document';
    }
    
    initSampleData() {
        if (this.users.length === 0) {
            this.users.push({
                id: this.generateId(),
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                phone: '0712345678',
                password: this.hashPassword('password123'),
                address: '123 Main St, Nairobi',
                addresses: ['123 Main St, Nairobi'],
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                suspended: false
            });
        }
        
        if (this.orders.length === 0) {
            this.orders.push({
                id: this.generateId(),
                customerId: this.users[0].id,
                customerName: 'John Doe',
                customerEmail: 'john@example.com',
                customerPhone: '0712345678',
                files: [
                    { 
                        name: 'sample.pdf', 
                        size: 1024000, 
                        type: 'application/pdf',
                        fileType: 'document'
                    }
                ],
                settings: {
                    paperSize: 'A4',
                    printType: 'bw',
                    layout: 'single',
                    copies: 2,
                    estimatedPageCount: 15,
                    finalPageCount: null,
                    binding: false,
                    laminating: false,
                    allImages: false
                },
                estimatedCost: 160,
                finalCost: null,
                status: 'completed',
                paymentStatus: 'completed',
                adminConfirmedPages: true,
                adminConfirmedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                tracking: {
                    orderReceived: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                    adminConfirmed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                    printing: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
                    ready: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                    completed: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
                }
            });
        }
        
        if (this.vouchers.length === 0) {
            this.vouchers.push({
                id: this.generateId(),
                code: 'WELCOME10',
                description: '10% off first order',
                type: 'percentage',
                discount: 10,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                usageLimit: 100,
                usedCount: 0,
                active: true
            });
        }
        
        if (this.notifications.length === 0) {
            this.notifications.push({
                id: this.generateId(),
                userId: this.users[0].id,
                title: 'Welcome to Amste Print Media!',
                message: 'Thank you for joining Amste Print Media. Start printing your documents today!',
                type: 'info',
                read: false,
                createdAt: new Date().toISOString()
            });
        }
        
        this.saveAllData();
    }
    
    // ---------- Customer Methods ----------
    registerUser(userData) {
        if (this.users.find(u => u.email === userData.email)) {
            return { success: false, message: 'Email already registered' };
        }
        
        const newUser = {
            id: this.generateId(),
            ...userData,
            password: this.hashPassword(userData.password),
            addresses: [userData.address],
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            suspended: false
        };
        
        this.users.push(newUser);
        
        this.addNotification({
            userId: newUser.id,
            title: 'Welcome to Amste Print Media!',
            message: `Welcome ${newUser.firstName}! Start printing your documents today.`,
            type: 'success'
        });
        
        this.saveAllData();
        return { success: true, message: 'Registration successful', userId: newUser.id };
    }
    
    loginUser(email, password) {
        const user = this.users.find(u => u.email === email);
        if (!user) return { success: false, message: 'User not found' };
        if (user.suspended) return { success: false, message: 'Account suspended. Contact support.' };
        if (!this.verifyPassword(password, user.password)) return { success: false, message: 'Invalid password' };
        
        user.lastActive = new Date().toISOString();
        this.saveAllData();
        
        this.currentUser = { ...user };
        return { success: true, message: 'Login successful', user: { ...user, password: undefined } };
    }
    
    getUserOrders(userId) {
        return this.orders.filter(o => o.customerId === userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    // createOrder is replaced by server call, but we keep it for backward compatibility
    createOrder(orderData) {
        const order = {
            id: this.generateId(),
            ...orderData,
            status: orderData.status || 'pending_admin_review',
            paymentStatus: 'pending',
            adminConfirmedPages: orderData.settings.allImages ? true : false,
            adminConfirmedAt: orderData.settings.allImages ? new Date().toISOString() : null,
            finalPageCount: orderData.settings.allImages ? null : null,
            finalCost: orderData.finalCost || null,
            discountAmount: orderData.discountAmount || 0,
            appliedVoucher: orderData.appliedVoucher || null,
            createdAt: new Date().toISOString(),
            tracking: {
                orderReceived: new Date().toISOString(),
                adminConfirmed: orderData.settings.allImages ? new Date().toISOString() : null,
                printing: null,
                ready: null,
                completed: null
            }
        };
        this.orders.push(order);
        
        const user = this.users.find(u => u.id === order.customerId);
        if (user) user.lastActive = new Date().toISOString();
        
        if (order.appliedVoucher) {
            const voucher = this.vouchers.find(v => v.id === order.appliedVoucher);
            if (voucher) voucher.usedCount++;
        }
        
        this.addNotification({
            userId: null,
            title: 'New Order Received',
            message: `New order #${order.id.slice(-8)} from ${order.customerName} requires ${order.settings.allImages ? 'payment' : 'review'}`,
            type: 'info',
            orderId: order.id
        });
        
        const message = order.settings.allImages
            ? `Your order #${order.id.slice(-8)} has been submitted. The total cost is Ksh ${order.finalCost}. Please complete payment.`
            : `Your order #${order.id.slice(-8)} has been submitted. Admin will review your files and confirm the page count.`;
        this.addNotification({
            userId: order.customerId,
            title: 'Order Submitted',
            message: message,
            type: 'info',
            orderId: order.id
        });
        
        this.saveAllData();
        return { success: true, message: order.settings.allImages ? 'Order submitted. Please pay now.' : 'Order submitted for admin review', orderId: order.id };
    }
    
    // ---------- Admin Methods ----------
    loginAgent(email, password) {
        if (email === 'amoskipkirui1927@gmail.com' && password === '34155041') {
            this.currentAgent = {
                id: 'admin1',
                name: 'Amos Kipkirui',
                email: email,
                phone: '0700000000',
                role: 'super_admin',
                isAdmin: true,
                createdAt: new Date().toISOString()
            };
            return { success: true, message: 'Admin login successful', agent: this.currentAgent };
        }
        return { success: false, message: 'Invalid admin credentials' };
    }
    
    getPendingAdminReviewOrders() {
        return this.orders.filter(o => o.status === 'pending_admin_review');
    }
    
    getAllOrders() {
        return this.orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    getOrderById(orderId) {
        return this.orders.find(o => o.id === orderId);
    }
    
    confirmPageCount(orderId, finalPageCount, finalCost, confirmedBy) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return { success: false, message: 'Order not found' };
        if (order.adminConfirmedPages) return { success: false, message: 'Pages already confirmed for this order' };
        if (order.settings.allImages) {
            return { success: false, message: 'This order has fixed pricing and does not require page count confirmation.' };
        }
        
        order.settings.finalPageCount = finalPageCount;
        order.finalCost = finalCost;
        order.adminConfirmedPages = true;
        order.adminConfirmedBy = confirmedBy;
        order.adminConfirmedAt = new Date().toISOString();
        order.status = 'awaiting_payment';
        order.tracking.adminConfirmed = new Date().toISOString();
        
        this.addNotification({
            userId: order.customerId,
            title: 'Order Ready for Payment',
            message: `Your order #${order.id.slice(-8)} has been reviewed. Final cost: Ksh ${finalCost}. Please complete payment via M-Pesa.`,
            type: 'success',
            orderId: order.id
        });
        
        this.saveAllData();
        
        // Emit real‑time update
        if (this.socket) {
            this.socket.emit('order-updated', order);
        }
        
        return { success: true, message: 'Page count confirmed. Customer can now make payment.', finalCost: finalCost };
    }
    
    customerMakesPayment(orderId, mpesaNumber) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return { success: false, message: 'Order not found' };
        if (!order.adminConfirmedPages) return { success: false, message: 'Please wait for admin to confirm page count first' };
        if (order.paymentStatus === 'completed') return { success: false, message: 'Payment already completed for this order' };
        if (!mpesaNumber || mpesaNumber.length < 10) return { success: false, message: 'Please enter a valid M-Pesa number' };
        
        order.paymentStatus = 'completed';
        order.status = 'paid';
        order.mpesaNumber = mpesaNumber;
        order.paymentDate = new Date().toISOString();
        
        this.addNotification({
            userId: null,
            title: 'Payment Received',
            message: `Payment of Ksh ${order.finalCost} received for order #${order.id.slice(-8)} from ${order.customerName}`,
            type: 'success',
            orderId: order.id
        });
        this.addNotification({
            userId: order.customerId,
            title: 'Payment Successful',
            message: `Payment of Ksh ${order.finalCost} received. Your order is now being processed.`,
            type: 'success',
            orderId: order.id
        });
        
        this.saveAllData();
        
        // Emit real‑time update
        if (this.socket) {
            this.socket.emit('order-updated', order);
        }
        
        return { success: true, message: `Payment of Ksh ${order.finalCost} successful! Your order is now being processed.` };
    }
    
    updateOrderStatus(orderId, status) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return { success: false, message: 'Order not found' };
        
        order.status = status;
        switch(status) {
            case 'printing': order.tracking.printing = new Date().toISOString(); break;
            case 'ready': order.tracking.ready = new Date().toISOString(); break;
            case 'completed': order.tracking.completed = new Date().toISOString(); break;
        }
        
        this.addNotification({
            userId: order.customerId,
            title: `Order Status Update`,
            message: `Your order #${order.id.slice(-8)} is now ${status.replace(/_/g, ' ')}.`,
            type: status === 'completed' ? 'success' : 'info',
            orderId: order.id
        });
        
        this.saveAllData();
        
        // Emit real‑time update
        if (this.socket) {
            this.socket.emit('order-updated', order);
        }
        
        return { success: true, message: `Order status updated to ${status}` };
    }
    
    cancelOrder(orderId, reason) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return { success: false, message: 'Order not found' };
        if (order.status === 'completed') return { success: false, message: 'Cannot cancel completed order' };
        
        order.status = 'cancelled';
        order.cancellationReason = reason;
        order.cancelledAt = new Date().toISOString();
        
        this.addNotification({
            userId: order.customerId,
            title: 'Order Cancelled',
            message: `Your order #${order.id.slice(-8)} has been cancelled. Reason: ${reason}`,
            type: 'error',
            orderId: order.id
        });
        
        this.saveAllData();
        
        // Emit real‑time update
        if (this.socket) {
            this.socket.emit('order-updated', order);
        }
        
        return { success: true, message: 'Order cancelled successfully' };
    }
    
    getAdminStats() {
        const totalOrders = this.orders.length;
        const completedOrders = this.orders.filter(o => o.status === 'completed').length;
        const totalRevenue = this.orders
            .filter(o => o.paymentStatus === 'completed')
            .reduce((sum, o) => sum + (o.finalCost || 0), 0);
        const pendingReview = this.orders.filter(o => o.status === 'pending_admin_review').length;
        const awaitingPayment = this.orders.filter(o => o.status === 'awaiting_payment').length;
        const activeOrders = this.orders.filter(o => ['paid', 'printing', 'ready'].includes(o.status)).length;
        
        return {
            totalOrders, completedOrders, totalRevenue, pendingReview, awaitingPayment, activeOrders,
            customers: this.users.length
        };
    }
    
    getAllUsers() {
        return this.users.map(u => ({ ...u, password: undefined }));
    }
    
    deleteUser(userId) {
        const userIndex = this.users.findIndex(u => u.id === userId);
        if (userIndex === -1) return { success: false, message: 'User not found' };
        
        this.notifications = this.notifications.filter(n => n.userId !== userId);
        this.users.splice(userIndex, 1);
        this.saveAllData();
        return { success: true, message: 'User deleted successfully' };
    }
    
    updateInventory(item, quantity) {
        if (this.inventory[item] !== undefined) {
            this.inventory[item] = parseInt(quantity);
            this.saveAllData();
            return { success: true, message: 'Inventory updated' };
        }
        return { success: false, message: 'Item not found' };
    }
    
    updatePricing(service, price) {
        if (this.pricing[service] !== undefined) {
            this.pricing[service] = parseFloat(price);
            this.saveAllData();
            return { success: true, message: 'Pricing updated' };
        }
        return { success: false, message: 'Service not found' };
    }
    
    toggleUserStatus(userId) {
        const user = this.users.find(u => u.id === userId);
        if (!user) return { success: false, message: 'User not found' };
        user.suspended = !user.suspended;
        this.addNotification({
            userId: userId,
            title: `Account ${user.suspended ? 'Suspended' : 'Activated'}`,
            message: `Your account has been ${user.suspended ? 'suspended' : 'activated'}. ${user.suspended ? 'Please contact support for assistance.' : 'You can now place orders again.'}`,
            type: user.suspended ? 'error' : 'success'
        });
        this.saveAllData();
        return { success: true, message: `User ${user.suspended ? 'suspended' : 'activated'} successfully` };
    }
    
    // ---------- Voucher System ----------
    createVoucher(voucherData) {
        const existing = this.vouchers.find(v => v.code === voucherData.code);
        if (existing) return { success: false, message: 'Voucher code already exists' };
        const newVoucher = {
            id: this.generateId(),
            ...voucherData,
            usedCount: 0,
            active: true,
            createdAt: new Date().toISOString()
        };
        this.vouchers.push(newVoucher);
        this.saveAllData();
        return { success: true, message: 'Voucher created', voucher: newVoucher };
    }
    
    getVouchers() {
        return this.vouchers;
    }
    
    applyVoucher(code, userId) {
        const voucher = this.vouchers.find(v => v.code === code && v.active);
        if (!voucher) return { success: false, message: 'Invalid voucher code' };
        if (new Date(voucher.expiresAt) < new Date()) return { success: false, message: 'Voucher has expired' };
        if (voucher.usageLimit && voucher.usedCount >= voucher.usageLimit) return { success: false, message: 'Voucher usage limit reached' };
        
        return { success: true, message: 'Voucher applied', voucherApplied: { id: voucher.id, code: voucher.code, discount: voucher.discount, type: voucher.type } };
    }
    
    // ---------- Inactivity Reminders ----------
    sendInactiveReminders(daysInactive = 30) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysInactive);
        const inactiveUsers = this.users.filter(u => new Date(u.lastActive) < cutoff && !u.suspended);
        let sentCount = 0;
        for (const user of inactiveUsers) {
            const message = `Hi ${user.firstName}, we miss you! It's been a while since your last activity. Use voucher code "WELCOMEBACK" for 15% off your next order!`;
            this.sendMessage('admin', 'admin', user.id, 'customer', message);
            this.addNotification({
                userId: user.id,
                title: 'We Miss You!',
                message: message,
                type: 'info'
            });
            sentCount++;
        }
        return { success: true, sentCount, message: `Sent reminders to ${sentCount} inactive customers.` };
    }
    
    // ---------- Messaging Methods ----------
    sendMessage(senderId, senderType, recipientId, recipientType, content) {
        if (!content || content.trim() === '') {
            return { success: false, message: 'Message cannot be empty' };
        }
        
        const message = {
            id: this.generateId(),
            senderId,
            senderType,
            recipientId,
            recipientType,
            content: content.trim(),
            createdAt: new Date().toISOString(),
            read: false,
            deletedBy: []
        };
        
        this.messages.push(message);
        this.saveAllData();
        
        this.emit('newMessage', message);
        
        // Emit real‑time via socket
        if (this.socket) {
            this.socket.emit('message-sent', message);
        }
        
        return { success: true, message: 'Message sent', data: message };
    }
    
    sendBroadcastMessage(senderId, senderType, recipientIds, content) {
        if (!content || content.trim() === '') {
            return { success: false, message: 'Message cannot be empty' };
        }
        const messagesSent = [];
        for (const recipientId of recipientIds) {
            const result = this.sendMessage(senderId, senderType, recipientId, 'customer', content);
            if (result.success) messagesSent.push(result.data);
        }
        return { success: true, messages: messagesSent, count: messagesSent.length };
    }
    
    getMessagesForUser(userId, isAdmin = false) {
        let messages;
        if (isAdmin) {
            messages = this.messages.filter(m => 
                !m.deletedBy.includes('admin') && 
                (m.recipientType === 'admin' || m.senderType === 'admin')
            );
        } else {
            messages = this.messages.filter(m => 
                !m.deletedBy.includes(userId) &&
                ((m.senderId === userId && m.senderType === 'customer') || 
                 (m.recipientId === userId && m.recipientType === 'customer'))
            );
        }
        return messages.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    }
    
    getConversationsForAdmin() {
        const conversations = new Map();
        const allMessages = this.messages.filter(m => !m.deletedBy.includes('admin'));
        
        allMessages.forEach(msg => {
            let customerId = null;
            if (msg.senderType === 'customer') customerId = msg.senderId;
            if (msg.recipientType === 'customer') customerId = msg.recipientId;
            if (!customerId) return;
            
            if (!conversations.has(customerId)) {
                conversations.set(customerId, []);
            }
            conversations.get(customerId).push(msg);
        });
        
        const result = [];
        for (let [customerId, messages] of conversations.entries()) {
            const customer = this.users.find(u => u.id === customerId);
            result.push({
                customerId,
                customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
                customerEmail: customer ? customer.email : '',
                messages: messages.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
            });
        }
        return result;
    }
    
    markMessageRead(messageId, userId) {
        const message = this.messages.find(m => m.id === messageId);
        if (message && !message.read) {
            message.read = true;
            this.saveAllData();
            return true;
        }
        return false;
    }
    
    deleteMessageForMe(messageId, userId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return { success: false, message: 'Message not found' };
        if (!message.deletedBy.includes(userId)) {
            message.deletedBy.push(userId);
            this.saveAllData();
            return { success: true, message: 'Message deleted for you' };
        }
        return { success: false, message: 'Message already deleted' };
    }
    
    deleteMessageForEveryone(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return { success: false, message: 'Message not found' };
        const index = this.messages.findIndex(m => m.id === messageId);
        this.messages.splice(index, 1);
        this.saveAllData();
        this.emit('messageDeleted', { messageId, forEveryone: true });
        return { success: true, message: 'Message deleted for everyone' };
    }
    
    deleteAllMessagesForUser(userId, isAdmin = false) {
        const messagesToDelete = this.messages.filter(m => 
            (!isAdmin && (m.senderId === userId || m.recipientId === userId)) ||
            (isAdmin && (m.senderType === 'admin' || m.recipientType === 'admin') && (m.senderId === userId || m.recipientId === userId))
        );
        for (const msg of messagesToDelete) {
            if (!msg.deletedBy.includes(userId)) {
                msg.deletedBy.push(userId);
            }
        }
        this.saveAllData();
        return { success: true, count: messagesToDelete.length };
    }
    
    getUnreadMessageCount(userId, isAdmin = false) {
        const messages = this.getMessagesForUser(userId, isAdmin);
        if (isAdmin) {
            return messages.filter(m => !m.read && m.recipientType === 'admin').length;
        } else {
            return messages.filter(m => !m.read && m.recipientId === userId && m.recipientType === 'customer').length;
        }
    }
    
    addNotification(notification) {
        const newNotification = {
            id: this.generateId(),
            ...notification,
            read: false,
            createdAt: new Date().toISOString()
        };
        this.notifications.push(newNotification);
        this.saveAllData();
        this.emit('notification', newNotification);
        
        // Emit real‑time via socket
        if (this.socket) {
            this.socket.emit('notification-created', newNotification);
        }
        
        return newNotification;
    }
    
    getNotifications(userId = null) {
        if (userId) {
            return this.notifications.filter(n => n.userId === userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        return this.notifications.filter(n => n.userId === null).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    
    markNotificationAsRead(notificationId) {
        const notification = this.notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            this.saveAllData();
            return true;
        }
        return false;
    }
    
    // ---------- Legacy helpers ----------
    sendMessageToCustomer(orderId, message) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return { success: false, message: 'Order not found' };
        this.addNotification({
            userId: order.customerId,
            title: `Message Regarding Order #${order.id.slice(-8)}`,
            message: message,
            type: 'info',
            orderId: orderId
        });
        return { success: true, message: 'Message sent to customer' };
    }
    
    downloadFile(orderId, fileIndex) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order || !order.files[fileIndex]) return { success: false, message: 'File not found' };
        return { success: true, file: order.files[fileIndex] };
    }
    
    getFileData(orderId, fileIndex) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order || !order.files[fileIndex]) return null;
        return order.files[fileIndex];
    }
    
    bulkUpdateOrderStatus(orderIds, status) {
        const results = [];
        for (const orderId of orderIds) {
            results.push(this.updateOrderStatus(orderId, status));
        }
        this.saveAllData();
        return { success: true, results };
    }
    
    generateInvoice(orderId) {
        const order = this.orders.find(o => o.id === orderId);
        if (!order) return null;
        return {
            invoiceNumber: `INV-${order.id.slice(-8)}`,
            orderId: order.id,
            customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
            items: [
                {
                    description: `Printing (${order.settings.finalPageCount} pages, ${order.settings.copies} copies, ${order.settings.printType === 'bw' ? 'Black & White' : 'Color'})`,
                    amount: order.finalCost - (order.settings.binding ? 50 : 0) - (order.settings.laminating ? 30 : 0)
                },
                ...(order.settings.binding ? [{ description: 'Spiral Binding', amount: 50 }] : []),
                ...(order.settings.laminating ? [{ description: 'Laminating', amount: 30 }] : [])
            ],
            total: order.finalCost,
            paymentStatus: order.paymentStatus,
            paymentDate: order.paymentDate,
            status: order.status,
            createdAt: order.createdAt
        };
    }
}

// Initialize backend globally
window.printingBackend = new PrintingBackend();