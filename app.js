const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const cors = require('cors');

const app = express();
const port = 4000;

let captchaStore = {};  // Lưu trữ CAPTCHA theo Discord ID
let captchaCompletedUsers = new Set();  // Sử dụng Set thay vì mảng để dùng .add()
let captchaAttempts = {};  // Lưu trữ số lần thử CAPTCHA của người dùng
let captchaExpiry = {};  // Lưu trữ thời gian hết hạn của CAPTCHA

const CAPTCHA_TIMEOUT = 5 * 60 * 1000;  // Thời gian hết hạn 5 phút
const MAX_ATTEMPTS = 3;  // Giới hạn số lần thử CAPTCHA

app.use(cors());
app.use(express.json());

function generateCaptchaText() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array(6).fill(null).map(() => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

function createCaptchaImage(captchaText) {
    const canvas = createCanvas(200, 80);
    const context = canvas.getContext('2d');

    // Tạo nền ngẫu nhiên với gradient và màu sắc
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`);
    gradient.addColorStop(1, `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Đa dạng font chữ và màu sắc
    const fonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier'];
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
    context.font = `40px ${randomFont}`;
    context.fillStyle = `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`;
    
    // Thêm các ký tự vào hình ảnh với độ xoay ngẫu nhiên
    for (let i = 0; i < captchaText.length; i++) {
        context.save();
        const x = 30 + i * 30;
        const y = Math.random() * 20 + 40;
        const rotation = Math.random() * 0.3 - 0.15; // Xoay ký tự ngẫu nhiên
        context.translate(x, y);
        context.rotate(rotation);
        context.fillText(captchaText[i], 0, 0);
        context.restore();
    }

    // Thêm nhiều đường cong ngẫu nhiên
    for (let i = 0; i < 5; i++) {
        context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        context.beginPath();
        context.moveTo(Math.random() * 200, Math.random() * 80);
        context.lineTo(Math.random() * 200, Math.random() * 80);
        context.stroke();
    }

    // Thêm điểm chấm và vệt mờ ngẫu nhiên
    for (let i = 0; i < 20; i++) {
        context.beginPath();
        context.arc(Math.random() * 200, Math.random() * 80, Math.random() * 5, 0, Math.PI * 2);
        context.fillStyle = 'rgba(0, 0, 0, 0.2)';
        context.fill();
    }

    // Thêm nhiễu (Noise) bằng cách vẽ các điểm ngẫu nhiên trên nền
    for (let i = 0; i < 100; i++) {
        context.beginPath();
        context.arc(Math.random() * 200, Math.random() * 80, Math.random() * 3, 0, Math.PI * 2);
        context.fillStyle = `rgba(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, 0.5)`;
        context.fill();
    }

    return canvas.toBuffer('image/png');
}

async function createCaptchaImageWithBackground(captchaText) {
    const canvas = createCanvas(300, 120);
    const context = canvas.getContext('2d');

    // Tạo màu nền ngẫu nhiên với gradient và màu sắc
    const color1 = `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`;
    const color2 = `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`;
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Thiết lập các thông số font chữ và màu sắc
    let textColor;
    do {
        textColor = `rgb(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)})`;
    } while (textColor === color1 || textColor === color2);  // Đảm bảo màu chữ không trùng với màu nền

    context.font = '40px Arial';
    context.fillStyle = textColor;

    // Điều chỉnh khoảng cách giữa các ký tự để tránh tràn ra ngoài canvas
    const charSpacing = 50;  // Khoảng cách giữa các ký tự
    const maxWidth = canvas.width - charSpacing * (captchaText.length - 1);  // Tính chiều rộng tối đa có thể sử dụng

    // Đảm bảo ký tự cuối không bị che khuất
    let totalWidth = context.measureText(captchaText).width;
    const adjustedSpacing = (canvas.width - totalWidth) / (captchaText.length + 1);

    // Thêm các ký tự CAPTCHA vào hình ảnh với độ xoay ngẫu nhiên
    for (let i = 0; i < captchaText.length; i++) {
        context.save();
        const x = adjustedSpacing + i * adjustedSpacing;
        const y = Math.random() * 20 + 60;
        const rotation = Math.random() * 0.3 - 0.15; // Xoay ký tự ngẫu nhiên
        context.translate(x, y);
        context.rotate(rotation);
        context.fillText(captchaText[i], 0, 0);
        context.restore();
    }

    // Thêm các đường cong ngẫu nhiên
    for (let i = 0; i < 5; i++) {
        context.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        context.beginPath();
        context.moveTo(Math.random() * 300, Math.random() * 120);
        context.lineTo(Math.random() * 300, Math.random() * 120);
        context.stroke();
    }

    // Thêm điểm chấm và vệt mờ ngẫu nhiên
    for (let i = 0; i < 20; i++) {
        context.beginPath();
        context.arc(Math.random() * 300, Math.random() * 120, Math.random() * 5, 0, Math.PI * 2);
        context.fillStyle = 'rgba(0, 0, 0, 0.2)';
        context.fill();
    }

    // Thêm nhiễu ngẫu nhiên
    for (let i = 0; i < 100; i++) {
        context.beginPath();
        context.arc(Math.random() * 300, Math.random() * 120, Math.random() * 3, 0, Math.PI * 2);
        context.fillStyle = `rgba(${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, ${Math.floor(Math.random() * 256)}, 0.5)`;
        context.fill();
    }

    return canvas.toBuffer('image/png');
}

// Endpoint để lấy CAPTCHA hình ảnh
app.get('/captcha-with-background', async (req, res) => {
    const { discordId } = req.query;

    if (!discordId) {
        return res.status(400).json({ success: false, message: "Missing discordId" });
    }

    // Kiểm tra và tạo CAPTCHA cho người dùng
    const captchaText = generateCaptchaText();
    captchaStore[discordId] = captchaText;
    captchaExpiry[discordId] = Date.now() + CAPTCHA_TIMEOUT;
    captchaAttempts[discordId] = (captchaAttempts[discordId] || 0) + 1;

    // Tạo CAPTCHA với hình nền ngẫu nhiên
    try {
        const imageBuffer = await createCaptchaImageWithBackground(captchaText);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(imageBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Error generating captcha' });
    }
});

app.get('/captcha', (req, res) => {
    const { discordId } = req.query;

    if (!discordId) {
        return res.status(400).json({ success: false, message: "Missing discordId" });
    }

    // Kiểm tra xem CAPTCHA có hết hạn hay không
    if (captchaExpiry[discordId] && Date.now() > captchaExpiry[discordId]) {
        delete captchaStore[discordId];  // Xóa CAPTCHA hết hạn
        delete captchaAttempts[discordId];  // Reset số lần thử
    }

    // Kiểm tra nếu người dùng đã thử quá số lần cho phép
    if (captchaAttempts[discordId] && captchaAttempts[discordId] >= MAX_ATTEMPTS) {
        return res.status(400).json({ success: false, message: 'Too many attempts, please try again later.' });
    }

    const captchaText = generateCaptchaText();
    captchaStore[discordId] = captchaText;
    captchaExpiry[discordId] = Date.now() + CAPTCHA_TIMEOUT;
    captchaAttempts[discordId] = (captchaAttempts[discordId] || 0) + 1;

    const imageBuffer = createCaptchaImage(captchaText);
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(imageBuffer);
});

app.post('/verify-captcha', (req, res) => {
    const { captcha, discordId } = req.body;

    if (!discordId || !captchaStore[discordId]) {
        return res.status(400).json({ success: false, message: 'Invalid or expired CAPTCHA request' });
    }

    // Kiểm tra CAPTCHA hết hạn
    if (Date.now() > captchaExpiry[discordId]) {
        delete captchaStore[discordId];
        delete captchaAttempts[discordId];
        delete captchaExpiry[discordId];
        return res.status(400).json({ success: false, message: 'Captcha has expired, please request a new one.' });
    }

    if (captcha === captchaStore[discordId]) {
        delete captchaStore[discordId]; // Xóa CAPTCHA sau khi xác minh thành công
        // Lưu trạng thái CAPTCHA của người dùng đã được xác minh
        captchaCompletedUsers.add(discordId); // Cập nhật trạng thái vào Set
        return res.status(200).json({ success: true, message: 'Captcha verified successfully!' });
    } else {
        return res.status(400).json({ success: false, message: 'Invalid captcha, please try again.' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
