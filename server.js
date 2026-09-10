const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

// Multiple files upload config (Max 20 files at once, 200MB limit)
const upload = multer({ 
    dest: 'uploads/', 
    limits: { fileSize: 200 * 1024 * 1024 } 
});

let vault = {};

app.use(express.urlencoded({ extended: true }));

// Home Page UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Quick File Vault</title>
        <style>
            * { box-sizing: border-box; }
            body { font-family: system-ui, sans-serif; background: #0b1120; color: #fff; text-align: center; padding: 20px; }
            .card { max-width: 400px; margin: 30px auto; background: #1e293b; padding: 24px; border-radius: 14px; border: 1px solid #334155; }
            h2 { color: #38bdf8; margin-bottom: 16px; }
            input, button { width: 100%; padding: 12px; margin: 8px 0; border-radius: 8px; font-size: 15px; }
            input[type="file"] { background: #0f172a; border: 1px dashed #475569; color: #94a3b8; }
            input[type="number"] { background: #0f172a; border: 1px solid #475569; color: #fff; text-align: center; font-size: 18px; letter-spacing: 4px; }
            button { background: #0284c7; color: white; font-weight: bold; border: none; cursor: pointer; }
            button:active { opacity: 0.85; }
            hr { margin: 24px 0; border: 0.5px solid #334155; }
            .hint { font-size: 12px; color: #94a3b8; margin-top: 4px; }
        </style>
    </head>
    <body>
        <div class="card">
            <h2>Send Files</h2>
            <form action="/upload" method="post" enctype="multipart/form-data">
                <!-- multiple attribute added taaki multiple select ho sakein -->
                <input type="file" name="files" multiple required>
                <div class="hint">Photos, Videos, PDFs, Docs select kar sakte hain</div>
                <button type="submit">Upload & Get 4-Digit PIN</button>
            </form>
            
            <hr>
            
            <h2>Receive Files</h2>
            <form action="/download" method="get">
                <input type="number" name="pin" placeholder="ENTER 4-DIGIT PIN" maxlength="4" required>
                <button type="submit" style="background:#10b981;">Download Everything</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

// Multiple Files Upload Route
app.post('/upload', upload.array('files', 20), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.send("Koi file select nahi ki gayi!");
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();

    // Agar sirf 1 file hai toh direct save, agar multiple hain toh list store
    vault[pin] = {
        files: req.files.map(f => ({ path: f.path, name: f.originalname })),
        isSingle: req.files.length === 1
    };

    res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="background:#0b1120; color:#fff; text-align:center; padding:50px 20px; font-family:system-ui;">
        <h2 style="color:#38bdf8;">${req.files.length} File(s) Uploaded!</h2>
        <p style="color:#94a3b8;">Yeh 4-Digit PIN receiver ko do:</p>
        <div style="font-size:48px; font-weight:800; color:#4ade80; letter-spacing:8px; margin:20px 0;">${pin}</div>
        <a href="/" style="display:inline-block; padding:10px 20px; background:#0284c7; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">Wapas Jayein</a>
    </body>
    </html>
    `);
});

// Download Route (Single ya Auto-ZIP)
app.get('/download', (req, res) => {
    const pin = req.query.pin;
    const item = vault[pin];

    if (!item) {
        return res.send("<h2 style='font-family:system-ui; text-align:center; padding:40px; color:#ef4444;'>Galat PIN ya file expire ho chuki hai!</h2>");
    }

    // Case 1: Agar sirf ek file thi (e.g. 1 video ya 1 PDF)
    if (item.isSingle) {
        const file = item.files[0];
        return res.download(file.path, file.name, (err) => {
            try {
                if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
                delete vault[pin];
            } catch (e) {}
        });
    }

    // Case 2: Agar multiple files hain (Photos + Videos + PDFs mix) -> ZIP bundle create karein
    res.attachment(`bundle_${pin}.zip`);
    const archive = archiver('zip', { zlib: { level: 5 } });

    archive.pipe(res);

    item.files.forEach(f => {
        if (fs.existsSync(f.path)) {
            archive.file(f.path, { name: f.name });
        }
    });

    archive.finalize();

    // Stream finish hone ke baad saari files server se delete
    res.on('finish', () => {
        item.files.forEach(f => {
            try {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            } catch (e) {}
        });
        delete vault[pin];
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
