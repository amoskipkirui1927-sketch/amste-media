// server.js – Production-ready backend with file upload, real‑time updates, static frontend
// Optimized for online hosting with proper error handling and environment config

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with production settings
const io = new Server(server, {
    cors: { 
        origin: process.env.NODE_ENV === 'production' 
            ? [process.env.FRONTEND_URL || 'https://your-app.onrender.com'] 
            : '*', 
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL || 'https://your-app.onrender.com'] 
        : '*',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config with error handling
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, unique + path.extname(safeName));
    }
});
const upload = mul({ 
    storage, 
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images, PDF, and Word documents are allowed.'));
        }
    }
});

// ---------- JSON Database Helpers ----------
const DB_PATH = path.join(__dirname, 'db.json');
let db = {
    users: [],
    orders: [],
    messages: [],
    notifications: [],
    expenses: [],
    pricing: {
        blackWhite: 5,
        color: 10,
        imagePrint: 25
    }
};

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            db = JSON.parse(data);
            if (!db.expenses) db.expenses = [];
            if (!db.pricing) {
                db.pricing = { blackWhite: 5, color: 10, imagePrint: 25 };
            }
        } else {
            // Create sample data only if database doesn't exist
            const sampleUser = {
                id: genId(),
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@example.com',
                phone: '0712345678',
                password: Buffer.from('password123').toString('base64'),
                address: '123 Main St, Nairobi',
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                suspended: false,
                totalSpent: 0
            };
            db.users.push(sampleUser);
            
            // Sample expenses
            db.expenses = [
                { id: genId(), amount: 5000, category: 'Rent', date: new Date().toISOString(), description: 'Monthly rent' },
                { id: genId(), amount: 2000, category: 'Utilities', date: new Date().toISOString(), description: 'Electricity & Water' },
                { id: genId(), amount: 3000, category: 'Supplies', date: new Date().toISOString(), description: 'Paper and ink' }
            ];
            saveDB();
        }
    } catch (error) {
        console.error('Error loading database:', error);
        // Initialize with empty data if loading fails
        db = {
            users: [],
            orders: [],
            messages: [],
            notifications: [],
            expenses: [],
            pricing: { blackWhite: 5, color: 10, imagePrint: 25 }
        };
        saveDB();
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

loadDB();

function genId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Helper: Add notification and emit via socket
function addNotification(userId, message, type = 'info') {
    try {
        const notification = {
            id: genId(),
            userId: userId,
            message: message,
            type: type,
            read: false,
            createdAt: new Date().toISOString()
        };
        db.notifications.push(notification);
        saveDB();
        // Emit to specific user
        io.emit('notification', notification);
        return notification;
    } catch (error) {
        console.error('Error adding notification:', error);
        return null;
    }
}

// ---------- Profit Analytics Helper ----------
function getProfitData(period) {
    try {
        const now = new Date();
        const labels = [];
        const revenueData = [];
        const expensesData = [];
        const profitData = [];
        
        const completedOrders = db.orders.filter(o => o.paymentStatus === 'completed');
        
        switch(period) {
            case 'daily':
                for (let i = 29; i >= 0; i--) {
                    const date = new Date(now);
                    date.setDate(now.getDate() - i);
                    date.setHours(0, 0, 0, 0);
                    const nextDate = new Date(date);
                    nextDate.setDate(date.getDate() + 1);
                    
                    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                    
                    const dayRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= date && orderDate < nextDate;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(dayRevenue);
                    
                    const dayExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= date && expenseDate < nextDate;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(dayExpenses);
                    
                    profitData.push(dayRevenue - dayExpenses);
                }
                break;
                
            case 'weekly':
                for (let i = 11; i >= 0; i--) {
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - (now.getDay() + 7 * i));
                    weekStart.setHours(0, 0, 0, 0);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);
                    
                    labels.push(`Week ${Math.abs(i - 11) + 1}`);
                    
                    const weekRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= weekStart && orderDate < weekEnd;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(weekRevenue);
                    
                    const weekExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= weekStart && expenseDate < weekEnd;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(weekExpenses);
                    
                    profitData.push(weekRevenue - weekExpenses);
                }
                break;
                
            case 'monthly':
                for (let i = 11; i >= 0; i--) {
                    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
                    
                    labels.push(monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
                    
                    const monthRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= monthStart && orderDate < monthEnd;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(monthRevenue);
                    
                    const monthExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= monthStart && expenseDate < monthEnd;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(monthExpenses);
                    
                    profitData.push(monthRevenue - monthExpenses);
                }
                break;
                
            case 'quarterly':
                for (let i = 7; i >= 0; i--) {
                    const quarterStart = new Date(now.getFullYear(), now.getMonth() - (i * 3), 1);
                    const quarterEnd = new Date(now.getFullYear(), now.getMonth() - (i * 3) + 3, 1);
                    
                    const quarter = Math.floor(quarterStart.getMonth() / 3) + 1;
                    labels.push(`Q${quarter} ${quarterStart.getFullYear()}`);
                    
                    const quarterRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= quarterStart && orderDate < quarterEnd;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(quarterRevenue);
                    
                    const quarterExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= quarterStart && expenseDate < quarterEnd;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(quarterExpenses);
                    
                    profitData.push(quarterRevenue - quarterExpenses);
                }
                break;
                
            case 'halfYearly':
                for (let i = 3; i >= 0; i--) {
                    const halfStart = new Date(now.getFullYear(), now.getMonth() - (i * 6), 1);
                    const halfEnd = new Date(now.getFullYear(), now.getMonth() - (i * 6) + 6, 1);
                    
                    const halfNum = Math.floor(halfStart.getMonth() / 6) + 1;
                    labels.push(`${halfStart.getFullYear()} H${halfNum}`);
                    
                    const halfRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= halfStart && orderDate < halfEnd;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(halfRevenue);
                    
                    const halfExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= halfStart && expenseDate < halfEnd;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(halfExpenses);
                    
                    profitData.push(halfRevenue - halfExpenses);
                }
                break;
                
            case 'yearly':
            default:
                const currentYear = now.getFullYear();
                for (let i = 4; i >= 0; i--) {
                    const year = currentYear - i;
                    const yearStart = new Date(year, 0, 1);
                    const yearEnd = new Date(year + 1, 0, 1);
                    
                    labels.push(year.toString());
                    
                    const yearRevenue = completedOrders
                        .filter(o => {
                            const orderDate = new Date(o.paymentDate || o.createdAt);
                            return orderDate >= yearStart && orderDate < yearEnd;
                        })
                        .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
                    revenueData.push(yearRevenue);
                    
                    const yearExpenses = db.expenses
                        .filter(e => {
                            const expenseDate = new Date(e.date);
                            return expenseDate >= yearStart && expenseDate < yearEnd;
                        })
                        .reduce((sum, e) => sum + e.amount, 0);
                    expensesData.push(yearExpenses);
                    
                    profitData.push(yearRevenue - yearExpenses);
                }
                break;
        }
        
        return { labels, revenue: revenueData, expenses: expensesData, profit: profitData };
    } catch (error) {
        console.error('Error calculating profit data:', error);
        return { labels: [], revenue: [], expenses: [], profit: [] };
    }
}

// ---------- Auth Routes ----------
app.post('/api/register', (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, address } = req.body;
        
        if (!firstName || !lastName || !email || !phone || !password || !address) {
            return res.status(400).json({ error: 'All fields are required' });
        }
        
        const phoneRegex = /^[0-9]{10,12}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({ error: 'Please enter a valid phone number (10-12 digits, numbers only)' });
        }
        
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        if (db.users.find(u => u.phone === phone)) {
            return res.status(400).json({ error: 'Phone number already registered' });
        }
        
        const newUser = {
            id: genId(),
            firstName,
            lastName,
            email,
            phone,
            password: Buffer.from(password).toString('base64'),
            address,
            addresses: [address],
            createdAt: new Date().toISOString(),
            lastActive: new Date().toISOString(),
            suspended: false,
            totalSpent: 0
        };
        
        db.users.push(newUser);
        saveDB();
        
        const { password: _, ...safeUser } = newUser;
        res.json({ success: true, user: safeUser });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        
        const user = db.users.find(u => u.email === email);
        if (!user) return res.status(401).json({ error: 'User not found' });
        if (user.suspended) return res.status(401).json({ error: 'Account suspended' });
        if (Buffer.from(password).toString('base64') !== user.password) {
            return res.status(401).json({ error: 'Invalid password' });
        }
        
        user.lastActive = new Date().toISOString();
        saveDB();
        const { password: _, ...safeUser } = user;
        res.json({ success: true, user: safeUser });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

app.post('/api/admin/login', (req, res) => {
    try {
        const { email, password } = req.body;
        // You should change these credentials for production
        const adminEmail = process.env.ADMIN_EMAIL || 'amoskipkirui1927@gmail.com';
        const adminPassword = process.env.ADMIN_PASSWORD || '34155041';
        
        if (email === adminEmail && password === adminPassword) {
            res.json({ success: true, agent: { id: 'admin1', name: 'Amos Kipkirui', email, role: 'super_admin' } });
        } else {
            res.status(401).json({ error: 'Invalid admin credentials' });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// ---------- Profit Analytics Endpoint ----------
app.get('/api/admin/profit-analytics', (req, res) => {
    try {
        const period = req.query.period || 'monthly';
        const data = getProfitData(period);
        res.json(data);
    } catch (error) {
        console.error('Error fetching profit analytics:', error);
        res.status(500).json({ error: 'Failed to fetch profit data' });
    }
});

// ---------- File Upload & Order Creation ----------
app.post('/api/orders', upload.array('files', 10), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        
        const { customerId, customerName, customerEmail, customerPhone, settings } = JSON.parse(req.body.orderData);
        
        const files = req.files.map(f => ({
            name: f.originalname,
            size: f.size,
            type: f.mimetype,
            fileType: /image\/(jpeg|png|gif|bmp)/.test(f.mimetype) ? 'image' : 'document',
            serverPath: '/uploads/' + path.basename(f.path)
        }));
        
        const allImages = files.every(f => f.fileType === 'image');
        const copies = parseInt(settings.copies) || 1;
        
        let finalCost = null;
        
        if (allImages) {
            finalCost = files.length * db.pricing.imagePrint * copies;
        }
        
        const order = {
            id: genId(),
            customerId, 
            customerName, 
            customerEmail, 
            customerPhone,
            files,
            settings: { 
                ...settings, 
                finalPageCount: null, 
                copies: copies,
                allImages
            },
            finalCost: finalCost,
            amountToPay: finalCost,
            status: allImages ? 'awaiting_payment' : 'pending_admin_review',
            paymentStatus: 'pending',
            adminConfirmedPages: allImages,
            adminConfirmedAt: allImages ? new Date().toISOString() : null,
            createdAt: new Date().toISOString(),
            tracking: { 
                orderReceived: new Date().toISOString(), 
                adminConfirmed: allImages ? new Date().toISOString() : null 
            }
        };
        
        db.orders.push(order);
        saveDB();
        
        // Emit to all connected clients
        io.emit('orderUpdate', order);
        
        const notificationMsg = allImages ? 
            `Your order #${order.id.slice(-8)} has been submitted. Please complete payment of Ksh ${finalCost}.` :
            `Your order #${order.id.slice(-8)} has been submitted and is pending admin review.`;
        addNotification(customerId, notificationMsg, 'order');
        
        res.json({ success: true, orderId: order.id, allImages, finalCost });
        
    } catch (error) {
        console.error('Order creation error:', error);
        // Clean up uploaded files if order creation fails
        if (req.files) {
            req.files.forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                } catch(e) {}
            });
        }
        res.status(500).json({ error: 'Failed to create order: ' + error.message });
    }
});

// ---------- Admin Routes ----------
app.get('/api/admin/orders/pending', (req, res) => {
    try {
        const pending = db.orders.filter(o => o.status === 'pending_admin_review');
        res.json(pending);
    } catch (error) {
        console.error('Error fetching pending orders:', error);
        res.status(500).json({ error: 'Failed to fetch pending orders' });
    }
});

function calculateOrderCost(order, pageCount) {
    const copies = order.settings.copies || 1;
    const pricePerPage = order.settings.printType === 'bw' ? db.pricing.blackWhite : db.pricing.color;
    
    let printingCost = 0;
    if (pageCount && pageCount > 0) {
        printingCost = pageCount * pricePerPage * copies;
    }
    
    let imageCost = 0;
    if (order.files) {
        const imageFiles = order.files.filter(f => f.fileType === 'image');
        if (imageFiles.length > 0) {
            imageCost = imageFiles.length * db.pricing.imagePrint * copies;
        }
    }
    
    return printingCost + imageCost;
}

app.post('/api/admin/orders/:orderId/confirm-pages', (req, res) => {
    try {
        const { finalPageCount } = req.body;
        const order = db.orders.find(o => o.id === req.params.orderId);
        
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (order.settings.allImages) return res.status(400).json({ error: 'Images have fixed pricing' });
        
        if (!finalPageCount || finalPageCount < 1) {
            return res.status(400).json({ error: 'Invalid page count' });
        }
        
        order.settings.finalPageCount = parseInt(finalPageCount);
        
        const calculatedCost = calculateOrderCost(order, finalPageCount);
        
        if (calculatedCost <= 0) {
            return res.status(400).json({ error: 'Calculated cost is invalid. Please check pricing configuration.' });
        }
        
        order.finalCost = calculatedCost;
        order.amountToPay = calculatedCost;
        order.adminConfirmedPages = true;
        order.adminConfirmedAt = new Date().toISOString();
        order.status = 'awaiting_payment';
        order.tracking.adminConfirmed = new Date().toISOString();
        
        saveDB();
        
        io.emit('orderUpdate', order);
        addNotification(order.customerId, `Your order #${order.id.slice(-8)} has been reviewed. Final cost: Ksh ${calculatedCost}. Please complete payment.`, 'order');
        
        res.json({ success: true, finalCost: calculatedCost });
    } catch (error) {
        console.error('Error confirming pages:', error);
        res.status(500).json({ error: 'Failed to confirm pages' });
    }
});

app.post('/api/orders/:orderId/pay', (req, res) => {
    try {
        const { mpesaNumber } = req.body;
        const order = db.orders.find(o => o.id === req.params.orderId);
        
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (!order.adminConfirmedPages) return res.status(400).json({ error: 'Admin must confirm page count first' });
        
        const amountToPay = order.amountToPay || order.finalCost;
        
        if (!amountToPay || amountToPay <= 0) {
            return res.status(400).json({ error: 'Invalid order amount. Please contact support.' });
        }
        
        if (order.paymentStatus === 'completed') {
            return res.status(400).json({ error: 'Already paid' });
        }
        
        const phoneRegex = /^[0-9]{10,12}$/;
        if (!phoneRegex.test(mpesaNumber)) {
            return res.status(400).json({ error: 'Please enter a valid phone number (10-12 digits, numbers only)' });
        }
        
        order.paymentStatus = 'completed';
        order.status = 'paid';
        order.mpesaNumber = mpesaNumber;
        order.paymentDate = new Date().toISOString();
        order.paidAmount = amountToPay;
        
        saveDB();

        const user = db.users.find(u => u.id === order.customerId);
        if (user) {
            user.totalSpent = (user.totalSpent || 0) + amountToPay;
            saveDB();
        }

        io.emit('orderUpdate', order);
        addNotification(order.customerId, `Payment of Ksh ${amountToPay} received for order #${order.id.slice(-8)}. We will start processing soon.`, 'payment');
        
        res.json({ 
            success: true, 
            message: `Payment of Ksh ${amountToPay} successful`, 
            amount: amountToPay 
        });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: 'Payment failed. Please try again.' });
    }
});

app.put('/api/admin/orders/:orderId/status', (req, res) => {
    try {
        const { status } = req.body;
        const order = db.orders.find(o => o.id === req.params.orderId);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.status = status;
        switch(status) {
            case 'printing': order.tracking.printing = new Date().toISOString(); break;
            case 'ready': order.tracking.ready = new Date().toISOString(); break;
            case 'completed': order.tracking.completed = new Date().toISOString(); break;
            case 'cancelled': order.tracking.cancelled = new Date().toISOString(); break;
        }
        saveDB();
        
        io.emit('orderUpdate', order);
        
        let friendlyMessage = '';
        switch(status) {
            case 'paid': friendlyMessage = `Payment confirmed for order #${order.id.slice(-8)}. We will start processing soon.`; break;
            case 'printing': friendlyMessage = `Your order #${order.id.slice(-8)} is now being printed.`; break;
            case 'ready': friendlyMessage = `Your order #${order.id.slice(-8)} is ready for pickup.`; break;
            case 'completed': friendlyMessage = `Your order #${order.id.slice(-8)} has been completed. Thank you!`; break;
            case 'cancelled': friendlyMessage = `Your order #${order.id.slice(-8)} has been cancelled.`; break;
            default: friendlyMessage = `Order #${order.id.slice(-8)} status updated to ${status}`;
        }
        addNotification(order.customerId, friendlyMessage, 'order');
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

app.get('/api/orders/:orderId/file/:fileIndex', (req, res) => {
    try {
        const order = db.orders.find(o => o.id === req.params.orderId);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        const file = order.files[parseInt(req.params.fileIndex)];
        if (!file) return res.status(404).json({ error: 'File not found' });
        const filePath = path.join(__dirname, file.serverPath);
        if (fs.existsSync(filePath)) {
            res.download(filePath, file.name);
        } else {
            res.status(404).json({ error: 'File missing on server' });
        }
    } catch (error) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

app.get('/api/users/:userId/orders', (req, res) => {
    try {
        const userOrders = db.orders
            .filter(o => o.customerId === req.params.userId)
            .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        userOrders.forEach(order => {
            if (!order.amountToPay && order.finalCost) {
                order.amountToPay = order.finalCost;
            }
        });
        
        res.json(userOrders);
    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

app.get('/api/admin/stats', (req, res) => {
    try {
        const totalOrders = db.orders.length;
        const completedOrders = db.orders.filter(o => o.status === 'completed').length;
        const totalRevenue = db.orders
            .filter(o => o.paymentStatus === 'completed')
            .reduce((sum, o) => sum + (o.paidAmount || o.finalCost || 0), 0);
        const pendingReview = db.orders.filter(o => o.status === 'pending_admin_review').length;
        const awaitingPayment = db.orders.filter(o => o.status === 'awaiting_payment').length;
        const activeOrders = db.orders.filter(o => ['paid','printing','ready'].includes(o.status)).length;
        res.json({ totalOrders, completedOrders, totalRevenue, pendingReview, awaitingPayment, activeOrders, customers: db.users.length });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.get('/api/admin/orders', (req, res) => {
    try {
        const orders = db.orders.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        orders.forEach(order => {
            if (!order.amountToPay && order.finalCost) {
                order.amountToPay = order.finalCost;
            }
        });
        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// ---------- Messaging Routes ----------
app.get('/api/users/:userId/messages', (req, res) => {
    try {
        const userId = req.params.userId;
        const userMessages = db.messages.filter(m => 
            !m.deletedBy.includes(userId) && (m.senderId === userId || m.recipientId === userId)
        ).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
        res.json(userMessages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.post('/api/messages', (req, res) => {
    try {
        const { senderId, senderType, recipientId, recipientType, content } = req.body;
        
        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Message content cannot be empty' });
        }
        
        const message = {
            id: genId(),
            senderId, 
            senderType, 
            recipientId, 
            recipientType,
            content: content.trim(), 
            createdAt: new Date().toISOString(),
            read: false, 
            deletedBy: []
        };
        db.messages.push(message);
        saveDB();
        
        io.emit('newMessage', message);
        
        if (recipientType === 'customer') {
            addNotification(recipientId, `New message from ${senderType === 'admin' ? 'Support Team' : 'Customer'}`, 'message');
        }
        
        res.json({ success: true, message });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.put('/api/messages/:messageId/read', (req, res) => {
    try {
        const msg = db.messages.find(m => m.id === req.params.messageId);
        if (msg) { 
            msg.read = true; 
            saveDB();
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking message read:', error);
        res.status(500).json({ error: 'Failed to mark message read' });
    }
});

app.delete('/api/messages/:messageId/for-me', (req, res) => {
    try {
        const { userId } = req.body;
        const msg = db.messages.find(m => m.id === req.params.messageId);
        if (msg && !msg.deletedBy.includes(userId)) {
            msg.deletedBy.push(userId);
            saveDB();
            io.emit('messageDeleted', { messageId: msg.id, forEveryone: false });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

app.get('/api/admin/conversations', (req, res) => {
    try {
        const convMap = new Map();
        db.messages.forEach(msg => {
            if (msg.deletedBy.includes('admin')) return;
            let customerId = null;
            if (msg.senderType === 'customer') customerId = msg.senderId;
            if (msg.recipientType === 'customer') customerId = msg.recipientId;
            if (!customerId) return;
            if (!convMap.has(customerId)) convMap.set(customerId, []);
            convMap.get(customerId).push(msg);
        });
        const result = [];
        for (let [cid, msgs] of convMap.entries()) {
            const user = db.users.find(u => u.id === cid);
            const unreadCount = msgs.filter(m => !m.read && m.senderType === 'customer').length;
            result.push({
                customerId: cid,
                customerName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
                customerPhone: user ? user.phone : 'Unknown',
                unreadCount: unreadCount,
                messages: msgs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
            });
        }
        res.json(result);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

app.post('/api/admin/broadcast', (req, res) => {
    try {
        const { recipientIds, content } = req.body;
        if (!recipientIds || !recipientIds.length) return res.status(400).json({ error: 'No recipients selected' });
        if (!content || content.trim() === '') return res.status(400).json({ error: 'Message content cannot be empty' });
        
        const messages = [];
        for (const recipientId of recipientIds) {
            const msg = {
                id: genId(),
                senderId: 'admin',
                senderType: 'admin',
                recipientId: recipientId,
                recipientType: 'customer',
                content: content.trim(),
                createdAt: new Date().toISOString(),
                read: false,
                deletedBy: []
            };
            db.messages.push(msg);
            messages.push(msg);
            io.emit('newMessage', msg);
            addNotification(recipientId, `Broadcast: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`, 'message');
        }
        saveDB();
        res.json({ success: true, count: messages.length });
    } catch (error) {
        console.error('Error sending broadcast:', error);
        res.status(500).json({ error: 'Failed to send broadcast' });
    }
});

// ---------- Notifications ----------
app.get('/api/users/:userId/notifications', (req, res) => {
    try {
        const notifications = db.notifications.filter(n => n.userId === req.params.userId).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

app.put('/api/notifications/:notificationId/read', (req, res) => {
    try {
        const notification = db.notifications.find(n => n.id === req.params.notificationId);
        if (notification) { notification.read = true; saveDB(); }
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification read:', error);
        res.status(500).json({ error: 'Failed to mark notification read' });
    }
});

app.put('/api/notifications/mark-all-read', (req, res) => {
    try {
        const { userId } = req.body;
        db.notifications.forEach(n => { if (n.userId === userId) n.read = true; });
        saveDB();
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking all notifications read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications read' });
    }
});

// ---------- Pricing ----------
app.get('/api/pricing', (req, res) => res.json(db.pricing));
app.post('/api/admin/pricing', (req, res) => {
    try {
        db.pricing = { ...db.pricing, ...req.body };
        saveDB();
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating pricing:', error);
        res.status(500).json({ error: 'Failed to update pricing' });
    }
});

// ---------- Users ----------
app.get('/api/admin/users', (req, res) => {
    try {
        const safe = db.users.map(({ password, ...rest }) => rest);
        res.json(safe);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.delete('/api/admin/users/:userId', (req, res) => {
    try {
        db.users = db.users.filter(u => u.id !== req.params.userId);
        db.orders = db.orders.filter(o => o.customerId !== req.params.userId);
        db.messages = db.messages.filter(m => m.senderId !== req.params.userId && m.recipientId !== req.params.userId);
        saveDB();
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.put('/api/admin/users/:userId/toggle-suspend', (req, res) => {
    try {
        const user = db.users.find(u => u.id === req.params.userId);
        if (user) { 
            user.suspended = !user.suspended; 
            saveDB();
            addNotification(user.id, `Your account has been ${user.suspended ? 'suspended' : 'activated'} by admin. Please contact support if you have questions.`, 'account');
        }
        res.json({ success: true, suspended: user ? user.suspended : false });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

app.get('/api/admin/unattended-count', (req, res) => {
    try {
        const pendingReview = db.orders.filter(o => o.status === 'pending_admin_review').length;
        const unreadMessages = db.messages.filter(m => m.senderType === 'customer' && !m.read && !m.deletedBy.includes('admin')).length;
        res.json({ pendingReview, unreadMessages });
    } catch (error) {
        console.error('Error fetching unattended count:', error);
        res.status(500).json({ error: 'Failed to fetch unattended count' });
    }
});

// Health check endpoint for hosting platforms
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});