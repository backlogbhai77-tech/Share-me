const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 100 * 1024 * 1024 } });

let vault = {};

app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Quick File Vault</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #fff; text-align: center; padding: 20px; }
            .card { max-width: 380px; margin: 40px auto; background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; }
            input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; border: 1px solid #475569; font-size: 16px; }
            input[type="file"], input[type="number"] { background: #0f172a; color: #fff; }
            button { background: #0284c7; color: white; font-weight: bold; border: none; cursor: pointer; }
            hr { margin: 24px 0; border: 0.5px solid #334155; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Send File</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="file" name="file" required><br>
                <button type="submit">Upload & Get 4-Digit PIN</button>
            </form>
            <hr>
            <h2>Receive File</h2>
            <form action="/download" method="get">
                <input type="number" name="pin" placeholder="ENTER 4-DIGIT PIN" required><br>
                <button type="submit" style="background:#10b981;">Download File</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.send("File missing!");

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    vault[pin] = {
        path: req.file.path,
        name: req.file.originalname
    };

    res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="background:#0f172a; color:#fff; text-align:center; padding:50px 20px; font-family:system-ui;">
        <h2>File Upload Success!</h2>
        <p style="color:#94a3b8; font-size:16px;">Yeh 4-Digit PIN receiver ko dein:</p>
        <div style="font-size:48px; font-weight:bold; color:#4ade80; letter-spacing:8px; margin:20px 0;">${pin}</div>
        <a href="/" style="display:inline-block; padding:10px 20px; background:#0284c7; color:#fff; text-decoration:none; border-radius:6px;">Wapas Jayein</a>
    </body>
    </html>
    `);
});

app.get('/download', (req, res) => {
    const pin = req.query.pin;
    const fileData = vault[pin];

    if (!fileData || !fs.existsSync(fileData.path)) {
        return res.send("<h2 style='font-family:system-ui; text-align:center; padding:40px; color:#ef4444;'>Galat PIN ya file expire ho chuki hai!</h2>");
    }

    res.download(fileData.path, fileData.name, (err) => {
        try {
            fs.unlinkSync(fileData.path);
            delete vault[pin];
        } catch (e) {}
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
