const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();

const upload = multer({ 
    dest: 'uploads/', 
    limits: { fileSize: 300 * 1024 * 1024 } // 300MB
});

let vault = {}; // { "4821": { files: [...], timestamp: 12345 } }

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Background auto-cleanup: 15 minutes purani files server se delete
setInterval(() => {
    const now = Date.now();
    for (const pin in vault) {
        if (now - vault[pin].timestamp > 15 * 60 * 1000) {
            vault[pin].files.forEach(f => {
                try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (e) {}
            });
            delete vault[pin];
        }
    }
}, 60 * 1000);

// Single Page Modern UI
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>DropVault - Fast File Transfer</title>
        <style>
            :root {
                --primary: #38bdf8;
                --primary-dark: #0284c7;
                --success: #10b981;
                --bg: #0b1120;
                --card-bg: rgba(30, 41, 59, 0.85);
                --border: #334155;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
            body { background: radial-gradient(circle at top, #1e293b, #0b1120); color: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
            .container { width: 100%; max-width: 420px; background: var(--card-bg); backdrop-filter: blur(12px); border-radius: 20px; padding: 28px 24px; border: 1px solid var(--border); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
            
            .header { text-align: center; margin-bottom: 24px; }
            .header h1 { font-size: 24px; font-weight: 800; background: linear-gradient(135deg, #38bdf8, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            .header p { font-size: 13px; color: #94a3b8; margin-top: 4px; }

            .card-section { background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; text-align: center; }
            .section-title { font-size: 13px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; }

            /* Custom Dropzone */
            .dropzone { border: 2px dashed #475569; border-radius: 12px; padding: 22px 14px; cursor: pointer; transition: all 0.2s; display: block; }
            .dropzone:hover { border-color: var(--primary); background: rgba(56, 189, 248, 0.05); }
            .file-count-text { font-size: 14px; color: var(--primary); font-weight: 600; margin-top: 6px; word-break: break-word; }

            input[type="file"] { display: none; }
            input[type="number"] { width: 100%; padding: 14px; border-radius: 10px; border: 1px solid var(--border); background: #0b1120; color: #fff; font-size: 22px; text-align: center; letter-spacing: 8px; outline: none; margin-bottom: 12px; }
            input[type="number"]:focus { border-color: var(--primary); }

            button { width: 100%; padding: 14px; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; transition: transform 0.1s, opacity 0.2s; }
            button:active { transform: scale(0.98); }
            .btn-blue { background: linear-gradient(135deg, #0284c7, #2563eb); color: white; }
            .btn-green { background: linear-gradient(135deg, #10b981, #059669); color: white; }

            /* Progress & Loading */
            .progress-container { display: none; margin-top: 14px; text-align: left; }
            .progress-bar-bg { width: 100%; height: 8px; background: #334155; border-radius: 4px; overflow: hidden; margin-top: 6px; }
            .progress-bar-fill { width: 0%; height: 100%; background: var(--primary); transition: width 0.2s; }
            .spinner { display: inline-block; width: 18px; height: 18px; border: 3px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
            @keyframes spin { to { transform: rotate(360deg); } }

            /* Result PIN display */
            .pin-box { display: none; margin-top: 16px; background: #0b1120; padding: 18px; border-radius: 12px; border: 1px solid #10b981; }
            .pin-value { font-size: 42px; font-weight: 900; letter-spacing: 8px; color: #4ade80; margin: 8px 0; }
            .timer { font-size: 12px; color: #f59e0b; font-weight: 600; }
            
            /* File List Area (Receiver side) */
            .file-list { display: none; margin-top: 14px; text-align: left; max-height: 200px; overflow-y: auto; }
            .file-item { display: flex; justify-content: space-between; align-items: center; background: #0b1120; padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; border: 1px solid var(--border); font-size: 13px; }
            .file-item a { color: var(--primary); text-decoration: none; font-weight: 600; padding: 4px 8px; background: rgba(56, 189, 248, 0.1); border-radius: 4px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>⚡ DropVault</h1>
                <p>Fast Long-Distance Direct Share</p>
            </div>

            <!-- SENDER CARD -->
            <div class="card-section">
                <div class="section-title">Send Files / Photos / Videos</div>
                <label class="dropzone" for="fileInput">
                    <span id="dropzoneText">📁 Tap to Select Files</span>
                    <div class="file-count-text" id="fileCount"></div>
                </label>
                <input type="file" id="fileInput" multiple onchange="onFilesChosen()">

                <button class="btn-blue" id="uploadBtn" onclick="startUpload()" style="display:none; margin-top: 12px;">Upload & Generate PIN</button>

                <!-- Progress Bar -->
                <div class="progress-container" id="progressWrap">
                    <div style="display: flex; justify-content: space-between; font-size: 12px; color: #94a3b8;">
                        <span id="progressStatus">Uploading...</span>
                        <span id="progressPercent">0%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" id="progressBar"></div>
                    </div>
                </div>

                <!-- PIN Result Box -->
                <div class="pin-box" id="pinArea">
                    <div style="font-size: 12px; color: #94a3b8;">SHARE THIS 4-DIGIT PIN:</div>
                    <div class="pin-value" id="generatedPin">0000</div>
                    <div class="timer" id="timerText">⏱ Expires in: 10:00</div>
                </div>
            </div>

            <!-- RECEIVER CARD -->
            <div class="card-section">
                <div class="section-title">Receive Files</div>
                <input type="number" id="receiverPin" placeholder="ENTER PIN" maxlength="4" oninput="if(this.value.length>4) this.value=this.value.slice(0,4)">
                <button class="btn-green" id="fetchBtn" onclick="fetchFiles()">View & Download Files</button>

                <!-- Files Available to Download -->
                <div class="file-list" id="fileList"></div>
            </div>
        </div>

        <script>
            let selectedFiles = [];

            function onFilesChosen() {
                const input = document.getElementById('fileInput');
                if (input.files.length > 0) {
                    selectedFiles = input.files;
                    document.getElementById('dropzoneText').innerText = "Selected:";
                    document.getElementById('fileCount').innerText = selectedFiles.length + " file(s) ready to send";
                    document.getElementById('uploadBtn').style.display = 'block';
                }
            }

            function startUpload() {
                if (!selectedFiles.length) return;

                const uploadBtn = document.getElementById('uploadBtn');
                const progressWrap = document.getElementById('progressWrap');
                const progressBar = document.getElementById('progressBar');
                const progressPercent = document.getElementById('progressPercent');
                const progressStatus = document.getElementById('progressStatus');

                uploadBtn.disabled = true;
                uploadBtn.innerHTML = '<span class="spinner"></span> Uploading...';
                progressWrap.style.display = 'block';

                const formData = new FormData();
                for (let i = 0; i < selectedFiles.length; i++) {
                    formData.append('files', selectedFiles[i]);
                }

                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/upload', true);

                // Progress Event
                xhr.upload.onprogress = function(e) {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        progressBar.style.width = percent + '%';
                        progressPercent.innerText = percent + '%';
                    }
                };

                xhr.onload = function() {
                    uploadBtn.disabled = false;
                    uploadBtn.innerText = "Upload & Generate PIN";
                    progressWrap.style.display = 'none';

                    if (xhr.status === 200) {
                        const res = JSON.parse(xhr.responseText);
                        document.getElementById('generatedPin').innerText = res.pin;
                        document.getElementById('pinArea').style.display = 'block';
                        startCountdown(10 * 60);
                    } else {
                        alert("Upload failed. Try again!");
                    }
                };

                xhr.onerror = function() {
                    alert("Network error! Server unreachable.");
                    uploadBtn.disabled = false;
                    uploadBtn.innerText = "Upload & Generate PIN";
                    progressWrap.style.display = 'none';
                };

                xhr.send(formData);
            }

            function startCountdown(durationSeconds) {
                let timer = durationSeconds;
                const timerEl = document.getElementById('timerText');
                const interval = setInterval(() => {
                    const mins = Math.floor(timer / 60);
                    const secs = timer % 60;
                    timerEl.innerText = '⏱ Expires in: ' + mins + ':' + (secs < 10 ? '0' : '') + secs;
                    if (--timer < 0) {
                        clearInterval(interval);
                        timerEl.innerText = "⚠️ Expired!";
                    }
                }, 1000);
            }

            async function fetchFiles() {
                const pin = document.getElementById('receiverPin').value.trim();
                const listWrap = document.getElementById('fileList');
                const fetchBtn = document.getElementById('fetchBtn');

                if (pin.length !== 4) return alert("4-digit PIN enter karein!");

                fetchBtn.disabled = true;
                fetchBtn.innerHTML = '<span class="spinner"></span> Checking PIN...';
                listWrap.style.display = 'none';
                listWrap.innerHTML = '';

                try {
                    const res = await fetch('/api/check/' + pin);
                    const data = await res.json();
                    fetchBtn.disabled = false;
                    fetchBtn.innerText = "View & Download Files";

                    if (!res.ok) {
                        return alert(data.error || "PIN galat hai ya expire ho chuka hai!");
                    }

                    // Direct file downloads (Images & Videos go straight to Gallery/Downloads)
                    let html = '<div style="font-size:12px; color:#94a3b8; margin-bottom:8px;">Tap file to save directly:</div>';
                    
                    data.files.forEach((f, index) => {
                        html += \`
                            <div class="file-item">
                                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">\${f.name}</span>
                                <a href="/api/file/\${pin}/\${index}" download="\${f.name}">Save</a>
                            </div>
                        \`;
                    });

                    // Agar multiple files hain toh single zip bundle option bhi do
                    if (data.files.length > 1) {
                        html += \`
                            <button onclick="window.location.href='/api/zip/\${pin}'" style="margin-top:10px; background:#475569; font-size:13px; padding:10px;">
                                📦 Download All in One ZIP
                            </button>
                        \`;
                    }

                    listWrap.innerHTML = html;
                    listWrap.style.display = 'block';

                } catch (e) {
                    fetchBtn.disabled = false;
                    fetchBtn.innerText = "View & Download Files";
                    alert("Server error. Please try again.");
                }
            }
        </script>
    </body>
    </html>
    `);
});

// API: Multiple Upload
app.post('/api/upload', upload.array('files', 20), (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: "No files" });

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    vault[pin] = {
        files: req.files.map(f => ({ path: f.path, name: f.originalname })),
        timestamp: Date.now()
    };
    res.json({ pin });
});

// API: Check files in PIN
app.get('/api/check/:pin', (req, res) => {
    const item = vault[req.params.pin];
    if (!item) return res.status(404).json({ error: "Invalid PIN ya file expire ho chuki hai!" });
    res.json({ files: item.files.map(f => ({ name: f.name })) });
});

// API: Direct Individual File Download (Direct JPG/MP4/PDF download)
app.get('/api/file/:pin/:index', (req, res) => {
    const item = vault[req.params.pin];
    if (!item) return res.status(404).send("Expired");

    const file = item.files[parseInt(req.params.index)];
    if (!file || !fs.existsSync(file.path)) return res.status(404).send("File missing");

    res.download(file.path, file.name);
});

// API: ZIP Download (Agar user pura bundle chahe)
app.get('/api/zip/:pin', (req, res) => {
    const item = vault[req.params.pin];
    if (!item) return res.status(404).send("Expired");

    res.attachment(`bundle_${req.params.pin}.zip`);
    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    item.files.forEach(f => {
        if (fs.existsSync(f.path)) archive.file(f.path, { name: f.name });
    });
    archive.finalize();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Vault running on ' + PORT));
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
